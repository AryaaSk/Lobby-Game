import { Component } from '@angular/core';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import CannonDebugRenderer from 'src/assets/cannonDebugRenderer';

import { box, sphere } from 'src/assets/objectHelperClasses';
import { Database, ref, set, onValue} from '@angular/fire/database';
import { remove } from '@firebase/database';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'lobbyGame';
  constructor (private db: Database) {}


  //OBJECTS:
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
  renderer = new THREE.WebGLRenderer()
  scene = new THREE.Scene();
  world = new CANNON.World();
  cannonDebugRenderer = new CannonDebugRenderer( this.scene, this.world );
  plane = new box();
  block1 = new box();
  player = new box();
  otherObjects: CANNON.Body[] = []; //list of all other objects in scene


  //Materials:
  noFrictionMaterial = new CANNON.Material( { friction: 0.0 } );;


  //CONSTANTS:
  playerInfo = {
    dimensions: {width: 5, height: 7, depth: 5},
    speed: 40,
    jumpHeight: 30,

    camera: {setY: 20, distance: 30},

    deviceID: 100, //will be assigned when the program starts (100 is just a placeholder)
    colour: 0xFF0000,
    name: ""
  };

  mainRefreshRate = 33; //refresh every 16ms (60fps)
  uploadRefreshRate = 33; //30fps

  impulseRadius = 1;


  //VARIABLES:
  pointerLock = false;
  popupText = "";
  otherPlayersObjects: {[k: number] : {
    deviceID: number, 
    movementData: {
      position: {x: number, y: number, z: number},
      rotation: {x: number, y: number, z: number}
  }}} = {};
  otherPlayersRendered: { [k: number] : box } = {}; //contains all the players which are currently rendered

  sceneImpulses: { [k: number] : {x: number, y: number, z: number} } = {};
  renderedImpulses: string[] = []; //keeps track of which impulses have been rendered





  
  //STARTUP:
  ngAfterViewInit()
  {
    this.worldSetup();

    this.createObjets();
    this.spawnPlayer();

    this.startAnimationLoop();
    this.startMovementListeners();
    this.startDataLoop();

    this.popup("Press Q to toggle shoot mode", 2000);
  } 




  
  //Boilerplate Functions:
  render()
  { this.renderer.render(this.scene, this.camera); };
  toRadians(angle: number) {
    return angle * (Math.PI / 180);
  }
  togglePointerLock()
  {
    if (this.pointerLock == true)
    { this.pointerLock = false; document.exitPointerLock(); }
    else
    { this.pointerLock = true; document.body.requestPointerLock(); }
  }
  syncCameraToPlayer()
  {
    const cameraRotationY = -this.player.bearing.y; this.camera.rotation.y = this.toRadians(cameraRotationY); //we also want to match the camera to the player's bearing.y
    //position exactly where player is, then move backwards by distance
    this.camera.position.set(this.player.tBody.position.x, this.playerInfo.camera.setY, this.player.tBody.position.z);
    this.camera.translateZ(this.playerInfo.camera.distance);
  }
  popup(text: string, time: number)
  {
    this.popupText = text;
    document.getElementById("popupText")!.style.opacity = "100%"
    setTimeout(() => {
      document.getElementById("popupText")!.style.opacity = "0%"
    }, time);
  }





  
  //WORLD FUNCTIONS:
  worldSetup()
  {
    document.body.addEventListener( 'click', () => { document.body.requestPointerLock(); this.pointerLock = true; }, {once : true} ); //lock mouse on screen when game starts

    //check if there is already a deviceID in localStorage
    if (localStorage.getItem("id") == undefined)
    {
      const randomID = Math.floor(Math.random() * (9999999999999999 - 1000000000000000 + 1) + 1000000000000000); //random number statistically almost guarnteed to be unique 
      this.playerInfo.deviceID = randomID; localStorage.setItem("id", String(randomID));
    }
    else
    { this.playerInfo.deviceID = Number(localStorage.getItem("id")!); }


    this.renderer = new THREE.WebGLRenderer({ //renderer setup
      canvas: document.getElementById("renderingWindow")!
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera.position.y = 30;
    this.camera.rotateX(this.toRadians(-0.5));

    const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.3);
    this.scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xFFFFFF, 1);
    pointLight.position.x = 50;
    pointLight.position.y = 50;
    pointLight.position.z = 50;
    pointLight.castShadow = true;
    pointLight.shadow.mapSize.width = 1024; //this increases the quality
    pointLight.shadow.mapSize.height = 1024;
    this.scene.add(pointLight);

    this.world.gravity.set(0, -50, 0)
  }
  createObjets()
  {
    this.plane.createObject(this.scene, this.world, { width: 100, height: 10, depth: 100 }, 0x0b7d2d, 0);
    this.plane.tBody.receiveShadow = true;
    this.plane.tBody.name = "plane";
    this.plane.cBody.material = new CANNON.Material( { friction: 0.0 } );

    this.block1.createObject(this.scene, this.world, {width: 5, height: 5, depth: 5}, 0x0000FF, 100000);
    this.block1.tBody.position.x = -20;
    this.block1.tBody.position.y = 7;
    this.block1.updateCANNONPosition();
    this.block1.tBody.receiveShadow = true;
    this.block1.tBody.castShadow = true;
    this.block1.cBody.material = this.noFrictionMaterial;

    this.otherObjects.push(this.plane.cBody);
    this.otherObjects.push(this.block1.cBody);

    this.player.createObject(this.scene, this.world, { width: this.playerInfo.dimensions.width, height: this.playerInfo.dimensions.height, depth: this.playerInfo.dimensions.depth }, this.playerInfo.colour, undefined, undefined, undefined);
    this.player.tBody.receiveShadow = true;
    this.player.tBody.castShadow = true;
    this.player.cBody.angularDamping = 1; //rotation lock
    this.player.cBody.linearDamping = 0.95; //we removed the friction but we still want an abrupt stop and start
    this.player.cBody.material = this.noFrictionMaterial;
  }
  spawnPlayer()
  {
    const randomX = Math.floor((Math.random() * 90) + 1) - 45; //-45 -> -45 RANDOM SPAWN
    const randomZ = Math.floor((Math.random() * 90) + 1) - 45;
    this.player.cBody.position.x = randomX;
    this.player.cBody.position.y = 15;
    this.player.cBody.position.z = randomZ;
    this.player.cBody.velocity.set(0, 0, 0);
  }





  
  //ANIMATION/TIME LOOP FUNCTIONS:
  startAnimationLoop()
  {
    //TODO: Implement delta time
    let lastUpdate = Date.now();
    setInterval(() => {
      const now = Date.now();
      const deltaTime = now - lastUpdate;
      lastUpdate = now;

      //to move player, calculate the overall force, rather than individually applying the forces, then just apply the overally force after each run of the switch statement
      let movementVector = new CANNON.Vec3(0, 0, 0);
      let rotationY = 0;

      let i = 0;
      while (i != this.keysDown.length)
      {
        const key = this.keysDown[i].toLowerCase();
        switch (key)
        {
          case "w":
            movementVector.z -= 1;
            break;
          case "s":
            movementVector.z += 1;
            break;
          case "a":
            movementVector.x -= 1;
            break;
          case "d":
            movementVector.x += 1;
            break;

          case " ": //we can also make a jump by giving a force in the y axis
            let i = 0;
            while (i != this.otherObjects.length) //check contact for every object
            { 
              let isColliding: any[] = []; //check if object is in the air (by checking if it is in contact with ground)
              this.world.narrowphase.getContacts([this.player.cBody], [this.otherObjects[i]], this.world, isColliding, [], [], [])
              if (isColliding.length >= 1) { movementVector.y += 1; break; }
              i += 1;
            }
            break;

          default:
            break;
        }
        i += 1;
      }

      //don't want the force to add up and become exponential, so i created this which checks the current speed, then only adds the required amount
      //this.player.cBody.velocity = new CANNON.Vec3(0, this.player.cBody.velocity.y, 0);
      const currentVelocity = this.player.cBody.velocity;
      const currentSpeed = Math.sqrt(currentVelocity.x**2 + currentVelocity.z**2);
      const appliedForce = Math.abs(this.playerInfo.speed - currentSpeed); //to keep it at a stable 30 (not currently needed since I reset the speed before each movement)

      const yVelocity = Math.abs(currentVelocity.y); //check velocity in y-axis, if it is >1 then don't allow another jump, since it could cause jump stacking
      if (yVelocity > 1)
      { movementVector.y = 0; }

      const impluseVector = new CANNON.Vec3(appliedForce * movementVector.x, this.playerInfo.jumpHeight * movementVector.y, appliedForce * movementVector.z); 
      this.player.cBody.applyLocalImpulse(impluseVector);
      this.player.cBody.quaternion.normalize();

      //going to also apply a speed limit in each axis
      const speedLimit = 100;
      if (this.player.cBody.velocity.x >= speedLimit) { this.player.cBody.velocity.x = speedLimit; }
      if (this.player.cBody.velocity.x <= -speedLimit) { this.player.cBody.velocity.x = -speedLimit; }
      if (this.player.cBody.velocity.z >= speedLimit) { this.player.cBody.velocity.z = speedLimit; }
      if (this.player.cBody.velocity.z <= -speedLimit) { this.player.cBody.velocity.z = -speedLimit; }
      
      this.player.bearing.y += rotationY;
      this.player.updateObjectBearing();

      //we can check if the player's y coordinate is <-10, if so then you know they have fallen off the edge and you can just restart the page and say they died
      if (this.player.cBody.position.y < -10)
      {
        this.popup("You died...", 2000);
        this.spawnPlayer();
      }

      //add other players:
      for (let key in this.otherPlayersObjects)
      {
        const player = this.otherPlayersObjects[Number(key)];
        const deviceID = player.deviceID;

        if (deviceID != this.playerInfo.deviceID) //if the deviceID is ours then we don't want to render a new object for ourselves
        {
          //check if this deviceID exists in the threejs scene
          if (this.scene.getObjectByName(String(deviceID)) == undefined)
          {
            const newPlayer = new box();
            newPlayer.id = deviceID;

            newPlayer.createObject(this.scene, this.world, {width: 5, height: 7, depth: 5}, 0xFF00FF, 0); //mass is 0 so the players aren't affected by gravity
            newPlayer.cBody.angularDamping = 1;
            newPlayer.tBody.receiveShadow = true;
            newPlayer.tBody.castShadow = true;
            newPlayer.cBody.material =  this.noFrictionMaterial;;

            this.otherPlayersRendered[deviceID] = newPlayer; //add it to the rendered objects
            this.otherObjects.push(newPlayer.cBody);
          }
          else
          {
            //if it does exist then it will be in the otherPlayersRendered dictionary
            const currentPlayer = this.otherPlayersRendered[deviceID];
        
            currentPlayer.cBody.position.x = player.movementData.position.x;
            currentPlayer.cBody.position.y = player.movementData.position.y;
            currentPlayer.cBody.position.z = player.movementData.position.z;

            currentPlayer.bearing.x = player.movementData.rotation.x;
            currentPlayer.bearing.y = player.movementData.rotation.y;
            currentPlayer.bearing.z = player.movementData.rotation.z;
            currentPlayer.updateObjectBearing();

            currentPlayer.updateTHREEPosition();
          }
        }
      }

      //render the sceneImpulses as well:
      for (let impulseID in this.sceneImpulses)
      {
        const impulse = this.sceneImpulses[impulseID]
        this.renderedImpulses.push(impulseID);

        //need to create an impulse three object, then just update it
        if (this.scene.getObjectByName(impulseID) == undefined)
        {
          const projectileGeo = new THREE.SphereGeometry(this.impulseRadius);
          const projectileMat = new THREE.MeshBasicMaterial( { color: 0xFFFF00 } )
          const projectile = new THREE.Mesh(projectileGeo, projectileMat);
          projectile.position.set(impulse.x, impulse.y, impulse.z);
          projectile.name = impulseID;
          this.scene.add(projectile);
        }
        else
        {
          //we can access it from this.scene.getObjectByName(impulseID)
          const projectile = this.scene.getObjectByName(impulseID)!;
          projectile.position.set(impulse.x, impulse.y, impulse.z);
        }
      }

      //Check which ids are in the rendered impulses, but not in the sceneImpulses, those are the impulses which need to be removed from the scene
      i = 0;
      while (i != this.renderedImpulses.length)
      {
        const impulseID = this.renderedImpulses[i];
        if (this.sceneImpulses[Number(impulseID)] == undefined)
        {
          this.scene.remove(this.scene.getObjectByName(impulseID)!)
          this.renderedImpulses.splice(i, 1);
        }
        else
        {
          i += 1;
        }
      }


      //step world and update object positions:
      this.world.step(deltaTime / 1000);
      this.plane.updateTHREEPosition();
      this.block1.updateTHREEPosition();
      this.player.updateTHREEPosition();
      this.syncCameraToPlayer();

      //this.cannonDebugRenderer.update();
      this.render();
    }, this.mainRefreshRate);
  }

  //Server and Database
  startDataLoop() 
  {
    //I can't upload everytime in the main animation loop, since it would be too often
    //This loop should be around 1 per second, it just creates the upload object then uploads it to firebase
    //It also gets other people's data, and downloads them here

    const dbRefUpload = ref(this.db, "players/" + this.playerInfo.deviceID);
    const dbRefDownload = ref(this.db, "players");

    setInterval(() => {

      const uploadData = {
        deviceID: this.playerInfo.deviceID, 
        movementData: {
          position: {x: this.player.cBody.position.x, y: this.player.cBody.position.y, z: this.player.cBody.position.z},
          rotation: {x: this.player.bearing.x, y: this.player.bearing.y, z: this.player.bearing.z}
        }
      };
      set(dbRefUpload, uploadData);
    }, this.uploadRefreshRate);

    //get all data from the firebase using realtime listener, then check if the deviceID is not the same as ours
    //add all the other data to a list of otherPlayers, then refresh that list as well
    onValue(dbRefDownload, (snapshot) => {
      const playerData = snapshot.val()
      for (let deviceID in playerData)
      {
        this.otherPlayersObjects[Number(deviceID)] = playerData[deviceID];
        //this.otherPlayersObjects[playerData[key].data.deviceID] = playerData[key].data;
      }
    });

    this.lookForImpluse();
    this.lookForSelfImpluse();

    //then we just add these players like usual during the animation loop
  }
  resetServer() //this is for when there are too many people playing at the same time
  {
    const password = "nothing123";
    const userPassword = prompt("Please enter the password to reset the server");

    if (userPassword == password)
    {
      const playersRef = ref(this.db, "players");
      remove(playersRef);
      location.reload();
    }
    else
    { this.popup("Invalid password", 500); }
  }



  //GAME MECHANICS:
  shoot($e: MouseEvent)
  {
    if (this.pointerLock == true) //only register click when pointer lock is disabled
    { return; }

    const raycaster = new THREE.Raycaster();
    const pointerX = ( $e.clientX / window.innerWidth ) * 2 - 1; 
    const pointerY = - ( $e.clientY / window.innerHeight ) * 2 + 1;    

    raycaster.setFromCamera({x: pointerX, y: pointerY}, this.camera);

    const intersects = raycaster.intersectObjects(this.scene.children);
    let destinationPoint = new THREE.Vector3(); //the raycaster returns 2 values when you click a point, Im not sure why
    if (intersects.length == 0) { return; }
    else { destinationPoint = intersects[0].point }

    //now we need to shoot from the player to the point
    const shotVector = {x: destinationPoint.x - this.player.tBody.position.x, y: destinationPoint.y - this.player.tBody.position.y, z: destinationPoint.z - this.player.tBody.position.z}
    this.projectile(this.impulseRadius, shotVector).then(() => {

      //once the animation has finished, we need to check which players are inside the blast radius
      const blastRadius = 10;

      const blastRadiusGeo = new THREE.SphereGeometry(blastRadius);
      const blastRadiusMat = new THREE.MeshStandardMaterial( { color: 0xFFFFFF } )
      const blastRadiusObject = new THREE.Mesh(blastRadiusGeo, blastRadiusMat);
      blastRadiusObject.position.set(destinationPoint.x, destinationPoint.y, destinationPoint.z);
      //this.scene.add(blastRadiusObject); //uncomment this line and comment the scene.remove() line if you want to visualise the blast radius

      //we can just use the intersects function to check
      const blastRadiusBB = new THREE.Box3().setFromObject(blastRadiusObject);
      
      //we need to check for every player, we can use the otherPlayersRendered dictionary
      for (let key in this.otherPlayersRendered)
      {
        const player = this.otherPlayersRendered[key];
        const playerBB = new THREE.Box3().setFromObject(player.tBody);
        
        if (blastRadiusBB.intersectsBox(playerBB))
        {
          //now we need to apply a vector to the other player, and also set the currentForce property in the player's database to that

          //calculte vector from destinationPoint to the playersPosition
          const playerKnockbackVector = {x: player.cBody.position.x - destinationPoint.x, y: player.cBody.position.y - destinationPoint.y, z: player.cBody.position.z - destinationPoint.z};

          //set the currentImpluse of the player to this value in firebase
          const dbRef = ref(this.db, "players/" + key + "/currentImpluse");
          set(dbRef, playerKnockbackVector)
        }
      }
      this.scene.remove(blastRadiusObject);
    });
  }
  projectile(radius: number, shotVector: {x: number, y: number, z: number}) //just the animation for the shot
  {
    const promise = new Promise((resolve, reject) => {
      //create new object at shotVector (no need for actual physics, we will just move the projectile in a certain direction)
      const projectileGeo = new THREE.SphereGeometry(radius);
      const projectileMat = new THREE.MeshBasicMaterial( { color: 0xFFFF00 } )
      const projectile = new THREE.Mesh(projectileGeo, projectileMat);
      projectile.position.set(this.player.tBody.position.x, this.player.tBody.position.y, this.player.tBody.position.z);
      this.scene.add(projectile);

      //repeat the loop 100 times to shoot the projectile
      const intervals = Math.sqrt(shotVector.x**2 + shotVector.z**2)
      const xIncrements = shotVector.x / intervals;
      const yInccrements = shotVector.y / intervals;
      const zIncrements = shotVector.z / intervals;

      //when this projectile is travelling we also want to upload the projectiles position
      const projectileID = Math.floor(Math.random() * (9999999999999999 - 1000000000000000 + 1) + 1000000000000000); //random number statistically almost guarnteed to be unique 
      const dbRef = ref(this.db, "impluses/" + projectileID);

      let counter = 0;
      const interval = setInterval(() => {
        projectile.translateX(xIncrements);
        projectile.translateY(yInccrements);
        projectile.translateZ(zIncrements);

        //need to upload the absolute values for the projectile to the realtime database
        set(dbRef, {x: projectile.position.x, y: projectile.position.y, z: projectile.position.z});

        if (counter >= intervals) { clearInterval(interval); setTimeout(() => {this.scene.remove(projectile);}, 100); remove(dbRef); resolve("Finish animation"); } //once animation has finished remove it
        counter += 1;
      }, 0.1);
    })
    return promise;
  }

  //Listeners:
  lookForSelfImpluse() //setting up a listener to look for an impluse to the current player body
  {
    const dbRef = ref(this.db, "players/" + this.playerInfo.deviceID + "/currentImpluse");
    onValue(dbRef, (snapshot) => {
      const impluse = snapshot.val();

      if (impluse == null || (impluse.x == 0 && impluse.y == 0 && impluse.z == 0)) { return; }

      //apply the impluse and then delete current impluse
      const multiplier = 10;
      const cannonImpluse = new CANNON.Vec3((impluse.x * multiplier), impluse.y * multiplier, (impluse.z * multiplier));
      this.player.cBody.applyImpulse(cannonImpluse);

      //delete:
      remove(dbRef);
    });
  }
  lookForImpluse() //this will look for impulses everywhere in the scene
  {
    const dbRef = ref(this.db, "impluses");
    onValue(dbRef, (snapshot) => {
      const data = snapshot.val();

      this.sceneImpulses = {}; //the screenImpulses object is always upto data with the realtime database
      for (let impulseID in data)
      {
        const impulse = data[impulseID];
        this.sceneImpulses[Number(impulseID)] = impulse; //will then get rendered in the animation loop
      }

    })

  }





  
  //KEYBOARD/MOUSE LISTENERS
  keysDown: string[] = []
  startMovementListeners()
  {
    document.onkeydown = ($e) =>  //so there is only ever 1 key of 1 type in the array
    {  
      if ($e.key == "q" || $e.key == "Q") ////press q to stop the mouse from affecting movement
      { this.togglePointerLock(); return; }
      if (this.keysDown.includes($e.key) == false) this.keysDown.push($e.key);
    }
    
    document.onkeyup = ($e) =>
    {  this.keysDown.splice(this.keysDown.indexOf($e.key), 1); }

    //also look for moues movement here which will control the player's rotation 
    document.onmousemove = ($e) =>
    {
      const rotationY = $e.movementX / 5;
      if (this.pointerLock == true)
      { this.player.bearing.y += rotationY; this.player.updateObjectBearing(); }
    }

    document.onmousedown = ($e) =>
    { this.shoot($e); }
  }
}
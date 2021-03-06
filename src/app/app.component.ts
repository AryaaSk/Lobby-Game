import { Component } from '@angular/core';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import CannonDebugRenderer from 'src/assets/cannonDebugRenderer';

import { box } from 'src/assets/objectHelperClasses';
import { Database, ref, set, onValue, remove} from '@angular/fire/database';

declare var JoyStick: any;

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
  player = new box();
  otherObjects: CANNON.Body[] = []; //list of all other objects in scene



  //CONSTANTS:
  playerInfo = {
    dimensions: {width: 5, height: 7, depth: 5},
    speed: 45,
    speedLimit: 70,
    jumpHeight: 30,
    colour: 0xFF0000,
    shootDelay: 500, //500ms delay between shots

    camera: {setY: 20, distance: 30},

    deviceID: 100, //will be assigned when the program starts (100 is just a placeholder)
    name: ""
  };
  enemyInfo = {
    colour: 0xFF00FF, 
    mass: 0 //mass is 0 so the players aren't affected by gravity
  }
  impulseInfo = {
    colour: 0x0000FF,
    radius: 1,
    blastRadius: 10,
    multiplier: 10
  }

  isMobile = false;
  shadowsEnabled = true;
  mainRefreshRate = 16; //refresh every 16ms (60fps)
  uploadRefreshRate = 33; //30fps


  //Materials:
  noFrictionMaterial = new CANNON.Material( { friction: 0.0 } );;
  blastRadiusGeo = new THREE.SphereGeometry(this.impulseInfo.blastRadius);
  blastRadiusMat = new THREE.MeshStandardMaterial( { color: this.impulseInfo.colour, transparent: true, opacity: 0.4 } )


  //VARIABLES:
  pointerLock = false;
  popupText = "";
  lastShot: number = Date.now();
  
  otherPlayersObjects: {[k: number] : {
    deviceID: number, 
    movementData: {
      position: {x: number, y: number, z: number},
      rotation: {x: number, y: number, z: number}
  }}} = {};
  otherPlayersRendered: { [k: number] : box } = {}; //contains all the players which are currently rendered

  sceneImpulses: { [k: number] : {x: number, y: number, z: number, senderID: string} } = {}; //this is always upto date with the database, holds all the impulses in the world apart from the current player's ones
  renderedImpulses: string[] = []; //keeps track of which impulses have been rendered, not including our ones


  


 
  //STARTUP:
  checkMobile()
  {
    //checks if the game is running on mobile or not using CSS media queries
    var match = window.matchMedia || window.matchMedia;
    if(match) {
        var mq = match("(pointer:coarse)");
        this.isMobile = mq.matches!;
    }
    else
    { this.isMobile = false; }
  }
  ngAfterViewInit()
  {
    this.checkMobile();

    if (this.isMobile == true)
    {
      this.worldSetup();

      this.loadObjects();
      this.spawnPlayer();

      this.startAnimationLoop();
      this.startDataLoop();

      this.mobileControls();
      document.getElementById("popupText")!.style.fontSize = "2rem";
      setTimeout(() => {
        document.getElementById("container")!.style.backgroundColor = "transparent";
        this.popup("Use the controls to move and click somewhere to shoot", 2000);
      }, 50);
    }
    else
    {
      this.popup("Click to Play", 100000000); //want to last basically forever
      document.body.addEventListener('click', () => {

        document.body.requestPointerLock(); this.pointerLock = true;  //lock mouse on screen when game starts

        this.worldSetup();

        this.loadObjects();
        this.spawnPlayer();

        this.startAnimationLoop();
        this.startDataLoop();

        this.keyboardMouseControls();
        document.getElementById("jumpButton")!.style.display = "none";
        setTimeout(() => {
          document.getElementById("container")!.style.backgroundColor = "transparent";
          this.popup("Press Q to toggle shoot mode", 2000);
        }, 50);

      }, {once : true} );
    }
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
    //check if there is already a deviceID in localStorage
    if (localStorage.getItem("id") == undefined)
    { const randomID = Math.floor(Math.random() * (9999999999999999 - 1000000000000000 + 1) + 1000000000000000);this.playerInfo.deviceID = randomID; localStorage.setItem("id", String(randomID)); } //random number statistically almost guarnteed to be unique
    else { this.playerInfo.deviceID = Number(localStorage.getItem("id")!); }

    const url = new URL(window.location.href);

    const shadows = url.searchParams.get("shadows"); //shadows are on by default, //you can turn shadows on or off by adding shadows=true / shadows=false in the url parameters
    if (shadows == "false") { this.shadowsEnabled = false; }
    else { this.shadowsEnabled = true; }

    const fpsString = url.searchParams.get("FPS"); //60fps by default
    if (fpsString != undefined){ const fps = Number(fpsString);this.mainRefreshRate = Math.round(1000 / fps); }

    const uploadRateString = url.searchParams.get("uploadFPS"); //30fps by default
    if (uploadRateString != undefined){ const uploadRate = Number(uploadRateString); this.uploadRefreshRate = Math.round(1000 / uploadRate); }


    this.renderer = new THREE.WebGLRenderer({ //renderer setup
      canvas: document.getElementById("renderingWindow")!
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.shadowsEnabled == true) { this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
    
    window.addEventListener("resize", () => { //to resize renderer when window resizes
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setPixelRatio(window.devicePixelRatio);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.render();
    })

    this.camera.position.y = 30;
    this.camera.rotateX(this.toRadians(-0.5));

    
    this.scene.background = new THREE.Color( 0x0d0d0d ) //dark grey

    const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.3);
    const pointLight = new THREE.PointLight(0xFFFFFF, 1);
    pointLight.position.x = 50;
    pointLight.position.y = 50;
    pointLight.position.z = 50;
    this.scene.add(ambientLight);
    this.scene.add(pointLight);

    if (this.shadowsEnabled == true) { pointLight.castShadow = true; pointLight.shadow.mapSize.width = 1024; pointLight.shadow.mapSize.height = 1024; }

    this.world.gravity.set(0, -50, 0)
  }
  loadObjects()
  {
    const textureLoader = new THREE.TextureLoader();
    
    const iceTexture = textureLoader.load("assets/Textures/ice.jpeg");
    iceTexture.wrapS = THREE.RepeatWrapping;
    iceTexture.wrapT = THREE.RepeatWrapping;
    iceTexture.repeat.set( 1, 1 );

    
    this.plane.createObject(this.scene, this.world, { width: 100, height: 10, depth: 100 }, 0x0b7d2d, 0);
    this.plane.tBody.receiveShadow = true;
    this.plane.tBody.name = "plane";
    this.plane.tBody.material = new THREE.MeshStandardMaterial( {map: iceTexture} );
    this.plane.cBody.material = new CANNON.Material( { friction: 0.0 } );

    this.otherObjects.push(this.plane.cBody);

    this.player.createObject(this.scene, this.world, { width: this.playerInfo.dimensions.width, height: this.playerInfo.dimensions.height, depth: this.playerInfo.dimensions.depth }, this.playerInfo.colour, undefined, undefined, undefined);
    this.player.tBody.receiveShadow = true;
    this.player.tBody.castShadow = true;
    this.player.cBody.angularDamping = 1; //rotation lock
    this.player.cBody.linearDamping = 0.95; //we removed the friction but we still want an abrupt stop and start
    this.player.cBody.material = this.noFrictionMaterial;
    this.player.tBody.name = "self";
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
    let lastUpdate = Date.now();
    setInterval(() => {
      const now = Date.now();
      const deltaTime = now - lastUpdate;
      lastUpdate = now;

      //hande movement
      this.handleMovement();
      
      //we can check if the player's y coordinate is <-10, if so then you know they have fallen off the edge and you can just restart the page and say they died
      if (this.player.cBody.position.y < -10)
      {
        this.popup("You died...", 2000);
        this.spawnPlayer();
      }

      //add other players:
      this.renderEnemies();

      //render the sceneImpulses as well:
      this.renderEnemyImpulses();

      //Check which ids are in the rendered impulses, but not in the sceneImpulses, those are the impulses which need to be removed from the scene
      this.removeEnemyImpulses();

      //step world and update object positions:
      this.updateWorld(deltaTime);

      this.render();
    }, this.mainRefreshRate);
  }

  handleMovement()
  {
    //to move player, calculate the overall force, rather than individually applying the forces, then just apply the overally force after each run of the switch statement
    let movementVector = new CANNON.Vec3(0, 0, 0);
    let rotationY = 0;
    let i = 0;
    while (i != this.keysDown.length)
    {
      const key = this.keysDown[i].toLowerCase();
      switch (key)
      {
        case "w": movementVector.z -= 1; break;
        case "s": movementVector.z += 1; break;
        case "a": movementVector.x -= 1; break;
        case "d": movementVector.x += 1; break;

        case " ": //we can also make a jump by giving a force in the y axis
          let a = 0;
          while (a != this.otherObjects.length) //check contact for every object
          { 
            let isColliding: any[] = []; //check if object is in the air (by checking if it is in contact with ground)
            this.world.narrowphase.getContacts([this.player.cBody], [this.otherObjects[a]], this.world, isColliding, [], [], [])
            if (isColliding.length >= 1) { movementVector.y += 1; break; }
            a += 1;
          }
          break;

        default:
          break;
      }
      i += 1;
    }

    const currentVelocity = this.player.cBody.velocity;
    const currentSpeed = Math.sqrt(currentVelocity.x**2 + currentVelocity.z**2);
    const appliedForce = Math.abs(this.playerInfo.speed - currentSpeed); //to keep it at a stable 30 (not currently needed since I reset the speed before each movement)

    const yVelocity = Math.abs(currentVelocity.y); //check velocity in y-axis, if it is >1 then don't allow another jump, since it could cause jump stacking
    if (yVelocity > 1) { movementVector.y = 0; }

    const impluseVector = new CANNON.Vec3(appliedForce * movementVector.x, this.playerInfo.jumpHeight * movementVector.y, appliedForce * movementVector.z); 
    this.player.cBody.applyLocalImpulse(impluseVector);
    this.player.cBody.quaternion.normalize();

    //going to also apply a speed limit in each axis
    const speedLimit = this.playerInfo.speedLimit;
    if (this.player.cBody.velocity.x >= speedLimit) { this.player.cBody.velocity.x = speedLimit; }
    if (this.player.cBody.velocity.x <= -speedLimit) { this.player.cBody.velocity.x = -speedLimit; }
    if (this.player.cBody.velocity.z >= speedLimit) { this.player.cBody.velocity.z = speedLimit; }
    if (this.player.cBody.velocity.z <= -speedLimit) { this.player.cBody.velocity.z = -speedLimit; }
    
    this.player.bearing.y += rotationY;
    this.player.updateObjectBearing();
  }

  renderEnemies()
  {
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

          newPlayer.createObject(this.scene, this.world, {width: 5, height: 7, depth: 5}, this.enemyInfo.colour, this.enemyInfo.mass);
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
  }

  renderEnemyImpulses()
  {
    for (let impulseID in this.sceneImpulses)
    {
      const impulse = this.sceneImpulses[impulseID]
      this.renderedImpulses.push(impulseID);

      //need to create an impulse three object, then just update it
      if (this.scene.getObjectByName(impulseID) == undefined)
      {
        const projectileGeo = new THREE.SphereGeometry(this.impulseInfo.radius);
        const projectileMat = new THREE.MeshBasicMaterial( { color: this.impulseInfo.colour } )
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
  }

  removeEnemyImpulses() //when the impulse has finished it's path, we also render a blast radius
  {
    let i = 0;
    while (i != this.renderedImpulses.length)
    {
      const impulseID = this.renderedImpulses[i];
      if (this.sceneImpulses[Number(impulseID)] == undefined)
      {
        //if we need to remove them, it means they have finished their path, so we can also render a blast radius
        const impulse = this.scene.getObjectByName(impulseID);
        if (impulse != undefined) //if it is undefined then it has already been removed from the scene, javascript is just a bit slow...
        {
          const blastRadiusObject = new THREE.Mesh(this.blastRadiusGeo, this.blastRadiusMat);
          blastRadiusObject.position.set(impulse!.position.x, impulse!.position.y, impulse!.position.z);
          this.scene.add(blastRadiusObject);

          this.scene.remove(impulse);
          this.renderedImpulses.splice(i, 1); 

          setTimeout(() => { this.scene.remove(blastRadiusObject); }, 300)
        }
        else
        { this.renderedImpulses.splice(i, 1); }
      }
      else
      { i += 1; }
    }
  }

  updateWorld(deltaTime: number)
  {
    this.world.step(deltaTime / 1000);

    this.plane.updateTHREEPosition();

    this.player.updateTHREEPosition();
    this.syncCameraToPlayer();

    //this.cannonDebugRenderer.update();
  }






  //Server and Database
  startDataLoop() 
  {
    //I can't upload everytime in the main animation loop, since it would be too often
    const oneTimeUpload = ref(this.db, "players/" + this.playerInfo.deviceID);

    //upload 1 time data such as deviceID, and in the future colour and name
    set(oneTimeUpload, { deviceID: this.playerInfo.deviceID });

    const dbRefUpload = ref(this.db, "players/" + this.playerInfo.deviceID + "/movementData");
    setInterval(() => {

      //TODO: Round the values to something around 3 dp, if you round to nearest integar then it looks laggy
      const movementData = {
        position: {x: this.player.cBody.position.x, y: this.player.cBody.position.y, z: this.player.cBody.position.z},
        rotation: {x: this.player.bearing.x, y: this.player.bearing.y, z: this.player.bearing.z}
      };
      set(dbRefUpload, movementData);
    }, this.uploadRefreshRate);


    //get all data from the firebase using realtime listener, then check if the deviceID is not the same as ours
    //add all the other data to a list of otherPlayers, then refresh that list as well
    const dbRefDownload = ref(this.db, "players");
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
      const impulsesRef = ref(this.db, "impulses");
      remove(playersRef);
      remove(impulsesRef);
      location.reload();
    }
    else
    { this.popup("Invalid password", 500); }
  }



  //GAME MECHANICS:
  shoot(x: number, y: number)
  {
    if (this.pointerLock == true) //only register click when pointer lock is disabled
    { return; }

    if (this.lastShot + (this.playerInfo.shootDelay) > Date.now()) { return; } //there needs to be a shoot delay, otherwise the player's could just spam
    else { this.lastShot = Date.now(); }

    const raycaster = new THREE.Raycaster();
    const pointerX = ( x / window.innerWidth ) * 2 - 1; 
    const pointerY = - ( y / window.innerHeight ) * 2 + 1;    

    raycaster.setFromCamera({x: pointerX, y: pointerY}, this.camera);

    const intersects = raycaster.intersectObjects(this.scene.children);
    let destinationPoint = new THREE.Vector3(); //the raycaster returns 2 values when you click a point, Im not sure why
    if (intersects.length == 0 || intersects[0].object.name == "self" ) { return; }
    else { destinationPoint = intersects[0].point }

    //now we need to shoot from the player to the point
    const shotVector = {x: destinationPoint.x - this.player.tBody.position.x, y: destinationPoint.y - this.player.tBody.position.y, z: destinationPoint.z - this.player.tBody.position.z}
    this.projectile(this.impulseInfo.radius, shotVector).then(() => {

      //once the animation has finished, we need to check which players are inside the blast radius, and we'll also render a blast radius
      const blastRadiusObject = new THREE.Mesh(this.blastRadiusGeo, this.blastRadiusMat);
      blastRadiusObject.position.set(destinationPoint.x, destinationPoint.y, destinationPoint.z);
      this.scene.add(blastRadiusObject);

      //we can just use the intersects function to check
      const blastRadiusBB = new THREE.Box3().setFromObject(blastRadiusObject);
      
      //we need to check for every player, we can use the otherPlayersRendered dictionary
      for (let key in this.otherPlayersRendered)
      {
        const player = this.otherPlayersRendered[key];
        const playerBB = new THREE.Box3().setFromObject(player.tBody);
        
        if (blastRadiusBB.intersectsBox(playerBB))
        {
          //calculte vector from destinationPoint to the playersPosition
          const playerKnockbackVector = {x: player.cBody.position.x - destinationPoint.x, y: player.cBody.position.y - destinationPoint.y, z: player.cBody.position.z - destinationPoint.z};

          //set the currentImpluse of the player to this value in firebase
          const dbRef = ref(this.db, "players/" + key + "/currentImpluse");
          set(dbRef, playerKnockbackVector)
        }
      }
      //we can also check ourself, and apply an impulse to our self
      const selfBB = new THREE.Box3().setFromObject(this.player.tBody);
      if (blastRadiusBB.intersectsBox(selfBB))
      {
        const playerKnockbackVector = {x: this.player.cBody.position.x - destinationPoint.x, y: this.player.cBody.position.y - destinationPoint.y, z: this.player.cBody.position.z - destinationPoint.z};
        const dbRef = ref(this.db, "players/" + this.playerInfo.deviceID + "/currentImpluse");
        set(dbRef, playerKnockbackVector)
      }

      setTimeout(() => { this.scene.remove(blastRadiusObject);}, 300);
    });
  }
  projectile(radius: number, shotVector: {x: number, y: number, z: number}) //just the animation for the shot
  {
    const promise = new Promise((resolve, reject) => {
      //create new object at shotVector (no need for actual physics, we will just move the projectile in a certain direction)
      const projectileGeo = new THREE.SphereGeometry(radius);
      const projectileMat = new THREE.MeshBasicMaterial( { color: this.impulseInfo.colour } )
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
      const dbRef = ref(this.db, "impulses/" + projectileID);

      let counter = 0;
      const interval = setInterval(() => {
        projectile.translateX(xIncrements);
        projectile.translateY(yInccrements);
        projectile.translateZ(zIncrements);

        //need to upload the absolute values for the projectile to the realtime database
        set(dbRef, {x: projectile.position.x, y: projectile.position.y, z: projectile.position.z, senderID: this.playerInfo.deviceID});

        if (counter >= intervals) { clearInterval(interval); this.scene.remove(projectile); remove(dbRef); resolve("Finish animation"); } //once animation has finished remove it
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
      const multiplier = this.impulseInfo.multiplier;
      const cannonImpluse = new CANNON.Vec3((impluse.x * multiplier), impluse.y * multiplier, (impluse.z * multiplier));
      this.player.cBody.applyImpulse(cannonImpluse);

      //delete:
      remove(dbRef);
    });
  }
  lookForImpluse() //this will look for impulses everywhere in the scene
  {
    const dbRef = ref(this.db, "impulses");
    onValue(dbRef, (snapshot) => {
      const data = snapshot.val();

      this.sceneImpulses = {}; //the screenImpulses object is always upto data with the realtime database
      for (let impulseID in data)
      {
        const impulse = data[impulseID];
        if (impulse.senderID != this.playerInfo.deviceID) //don't want to render our own impulses
        { this.sceneImpulses[Number(impulseID)] = impulse; } //will then get rendered in the animation loop
      }
    })
  }





  //MOBILE CONTROLS;
  mobileControls()
  {
    const colour = `#${this.playerInfo.colour.toString(16).toUpperCase()}`;
    var joy = new JoyStick('joyDiv', {internalFillColor: colour, internalStrokeColor: "#000000", externalStrokeColor: "#000000" });
    joy.internalFillColor = "red";

    //check controls with the refresh rate
    setInterval(() => {
        
      const xPosition = joy.GetX(); //goes from -100 at left to 100 at right
      const yPosition = joy.GetY(); //goes from 100 at top to -100 at bottom

      //set deadzone
      const deadzone = 50;

      if (xPosition < -deadzone)
      { this.player.bearing.y -= 3; this.player.updateObjectBearing(); }
      else if (xPosition > deadzone)
      { this.player.bearing.y += 3; this.player.updateObjectBearing(); }

      if (yPosition > deadzone)
      { if (this.keysDown.includes("w") == false) { this.keysDown.push("w") }; }
      else if (yPosition <= deadzone && yPosition >= -deadzone)
      { 
        //remove w and s, and don't accidentally remove the space bar
        const wIndex = this.keysDown.indexOf("w");
        const sIndex = this.keysDown.indexOf("s");

        if (wIndex != -1) { this.keysDown.splice(wIndex, 1) }
        if (sIndex != -1) { this.keysDown.splice(sIndex, 1) }
      }
      else 
      { if (this.keysDown.includes("s") == false) { this.keysDown.push("s") }; }

    }, this.mainRefreshRate);

    document.getElementById("jumpButton")!.addEventListener('touchstart', () => {
      if (this.keysDown.includes(" ") == false) { this.keysDown.push(" "); }

      //wait until the click has been register, which will be at max the mainRefreshRate
      setTimeout(() => {
        this.keysDown.splice(this.keysDown.indexOf(" "), 1);
      }, this.mainRefreshRate)
    })

    //need to check if user was just clicking the joystick or the jumpButton
    const joystickPos = document.getElementById("joyDiv")!.getBoundingClientRect();
    const jumpButtonPos = document.getElementById("jumpButton")!.getBoundingClientRect();

    document.body.addEventListener('touchstart', ($e) => {
      //user may just be clicking the joystick or jump button
      const inJoystick = ($e.targetTouches[0].clientX > joystickPos.x && $e.targetTouches[0].clientX < (joystickPos.x + joystickPos.width)) && ($e.targetTouches[0].clientY > joystickPos.y && $e.targetTouches[0].clientY < (joystickPos.y + joystickPos.height))
      const inJumpButton = ($e.targetTouches[0].clientX > jumpButtonPos.x && $e.targetTouches[0].clientX < (jumpButtonPos.x + jumpButtonPos.width)) && ($e.targetTouches[0].clientY > jumpButtonPos.y && $e.targetTouches[0].clientY < (jumpButtonPos.y + jumpButtonPos.height))

      if (!(inJoystick || inJumpButton))
      { this.shoot($e.targetTouches[0].clientX, $e.targetTouches[0].clientY) }
    });
  }


  
  //KEYBOARD/MOUSE LISTENERS:
  keysDown: string[] = []
  keyboardMouseControls()
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

    document.onmousedown = ($e) => { this.shoot($e.clientX, $e.clientY); }
  }
}
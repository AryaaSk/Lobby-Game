import { Component } from '@angular/core';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import CannonDebugRenderer from 'src/assets/cannonDebugRenderer';

import { box  } from 'src/assets/objectHelperClasses';
import { Database, ref, set, onValue} from '@angular/fire/database';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'FPSTest';
  constructor (private db: Database) {}

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
  renderer = new THREE.WebGLRenderer()
  scene = new THREE.Scene();
  world = new CANNON.World();
  cannonDebugRenderer = new CannonDebugRenderer( this.scene, this.world );

  plane = new box();
  player = new box();

  block1 = new box();

  otherObjects: CANNON.Body[] = []; //list of all other objects in scene

  render()
  { this.renderer.render(this.scene, this.camera); };

  deviceID = 100;
  ngAfterViewInit()
  {
    //check if there is already a deviceID in localStorage
    if (localStorage.getItem("id") == undefined)
    {
      const randomID = Math.floor(Math.random() * (9999999999999999 - 1000000000000000 + 1) + 1000000000000000); //random number statistically almost guarnteed to be unique 
      this.deviceID = randomID;
      localStorage.setItem("id", String(randomID));
    }
    else
    { this.deviceID = Number(localStorage.getItem("id")!); }

    this.renderer = new THREE.WebGLRenderer({ //renderer setup
      canvas: document.getElementById("renderingWindow")!
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera.position.z = 30;
    this.camera.position.y = 30;
    this.camera.rotation.x = -0.5;

    const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.3);
    this.scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xFFFFFF, 1);
    pointLight.position.x = 50;
    pointLight.position.y = 50;
    pointLight.position.z = 50;
    pointLight.castShadow = true;
    pointLight.shadow.mapSize.width = 2048; //this increases the quality
    pointLight.shadow.mapSize.height = 2048;
    this.scene.add(pointLight);


    this.world.gravity.set(0, -20, 0)


    //Create Objects:
    this.plane.createObject(this.scene, this.world, { width: 100, height: 10, depth: 100 }, 0x0b7d2d, 0);
    this.plane.tBody.receiveShadow = true;

    this.block1.createObject(this.scene, this.world, {width: 5, height: 5, depth: 5}, 0x0000FF, 10000);
    this.block1.tBody.position.x = -20;
    this.block1.tBody.position.y = 7;
    this.block1.updateCANNONPosition();
    this.block1.tBody.receiveShadow = true;
    this.block1.tBody.castShadow = true;

    //going to create the player's cBody as a sphere, since they move more smoothly
    const playerWidth = 5;
    const playerHeight = 7;
    const playerDepth = 5;


    this.player.createObject(this.scene, this.world, { width: playerWidth, height: playerHeight, depth: playerDepth }, 0xFF0000, undefined, undefined, undefined);
    const randomX = Math.floor((Math.random() * 5) + 1) - 5; //-5 -> 5 RANDOM SPAWN
    const randomZ = Math.floor((Math.random() * 5) + 1) - 5;
    this.player.tBody.position.x = randomX;
    this.player.tBody.position.y = 15;
    this.player.tBody.position.z = randomZ;
    this.player.updateCANNONPosition();
    this.player.tBody.receiveShadow = true;
    this.player.tBody.castShadow = true;
    this.player.cBody.angularDamping = 1; //rotation lock


    //Create collision interactions:
    this.player.cBody.material = new CANNON.Material();
    this.plane.cBody.material = new CANNON.Material();
    const slipperyContactMaterial = new CANNON.ContactMaterial(this.player.cBody.material, this.plane.cBody.material, { friction: 0.0 }); //friction set to 0.0 seems to solve all the problems
    this.world.addContactMaterial(slipperyContactMaterial);

    this.otherObjects.push(this.plane.cBody);
    this.otherObjects.push(this.block1.cBody);

    this.startAnimationLoop();
    this.startMovementListeners();
    this.startDataLoop();
  }

  startAnimationLoop()
  {
    setInterval(() => {
      //check the keysDown and apply the information, before we step the world

      //calculate the overall force, rather than individually applying the forces, then just apply the overally force after each run of the switch statement
      const speed = 40; 
      const jumpHeight = 15;
      const rotationSpeed = 3;

      let movementVector = new CANNON.Vec3(0, 0, 0);
      let rotationY = 0;

      let i = 0;
      while (i != this.keysDown.length)
      {
        const key = this.keysDown[i];
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


          case "ArrowLeft":
            rotationY -= rotationSpeed;
            break;
          case "ArrowRight":
            rotationY += rotationSpeed;
            break;


          default:
            break;
        }
        i += 1;
      }

      //don't want the force to add up and become exponential, so i created this which checks the current speed, then only adds the required amount
      this.player.cBody.velocity = new CANNON.Vec3(0, this.player.cBody.velocity.y, 0);
      const currentVelocity = this.player.cBody.velocity;
      const currentSpeed = Math.sqrt(currentVelocity.x**2 + currentVelocity.z**2);
      const appliedForce = Math.abs(speed - currentSpeed); //to keep it at a stable 30 (not currently needed since I reset the speed before each movement)

      /*TURNS OUT I DON'T HAVE TO CALCULATE THE ABSOULTE VECTOR, I CAN JUST USE APPLYLOCALIMPLISE AND NORMALIZE THE QUARTERNION */ /*
      let rotation = this.player.bearing.y % 90;
      //the negative and positive rotations will be confusing, so convert them all into positve in terms of the 90 degree triangle
      if (rotation < 0) rotation = 90 + rotation;
      //we have the rotation and the appliedForce, now we can work out the changeZ and changeX, using trignometry, first we need to convert to radians
      function toRadians (angle: number) {
        return angle * (Math.PI / 180);
      } */

      const impluseVector = new CANNON.Vec3(appliedForce * movementVector.x, jumpHeight * movementVector.y, appliedForce * movementVector.z); 
      this.player.cBody.applyLocalImpulse(impluseVector);
      this.player.cBody.quaternion.normalize();
      
      this.player.bearing.y += rotationY;
      this.player.updateObjectBearing();


      //add other players:
      for (let key in this.otherPlayersObjects)
      {
        const player = this.otherPlayersObjects[key];
        const deviceID = player.deviceID;

        if (deviceID != this.deviceID) //if the deviceID is ours then we don't want to render a new object for ourselves
        {
          //check if this deviceID exists in the threejs scene
          if (this.scene.getObjectByName(String(deviceID)) == undefined)
          {
            const newPlayer = new box();
            newPlayer.id = deviceID;

            newPlayer.createObject(this.scene, this.world, {width: 5, height: 7, depth: 5}, 0xFF00FF, 10000); //set mass to 10000 so that the other players cannot be moved by the first player
            newPlayer.cBody.angularDamping = 1;
            newPlayer.tBody.receiveShadow = true;
            newPlayer.tBody.castShadow = true;

            this.otherPlayersRendered[deviceID] = newPlayer; //add it to the rendered objects
            this.otherObjects.push(newPlayer.cBody);
          }
          else
          {
            //if it does exist then it will be in the otherPlayersRendered dictionary
            const currentPlayer = this.otherPlayersRendered[deviceID];
        
            currentPlayer.cBody.position.x = player.position.x;
            currentPlayer.cBody.position.y = player.position.y;
            currentPlayer.cBody.position.z = player.position.z;

            currentPlayer.bearing.x = player.rotation.x;
            currentPlayer.bearing.y = player.rotation.y;
            currentPlayer.bearing.z = player.rotation.z;
            currentPlayer.updateObjectBearing();

            currentPlayer.updateTHREEPosition();
          }
        }
      }

      this.world.step(1 / 60);

      //update object positions:
      this.plane.updateTHREEPosition();

      this.player.updateTHREEPosition();
      this.syncCameraToPlayer();

      this.block1.updateTHREEPosition();

      this.cannonDebugRenderer.update();
      this.render();
    }, 16);
  }

  otherPlayersObjects: {[k: number] : {deviceID: number, position: {x: number, y: number, z: number}, rotation: {x: number, y: number, z: number}}} = {}
  otherPlayersRendered: {[k: number] : box} = {}; //contains all the players which are currently rendered
  startDataLoop() 
  {
    //I can't upload everytime in the main animation loop, since it would be too often
    //This loop should be around 1 per second, it just creates the upload object then uploads it to firebase
    //It also gets other people's data, and downloads them here

    const dbRefUpload = ref(this.db, "players/" + this.deviceID);
    const dbRefDownload = ref(this.db, "players");

    setInterval(() => {
      const uploadData = {deviceID: this.deviceID, position: {x: this.player.cBody.position.x, y: this.player.cBody.position.y, z: this.player.cBody.position.z}, rotation: {x: this.player.bearing.x, y: this.player.bearing.y, z: this.player.bearing.z}};
      set(dbRefUpload, uploadData);
    }, 50)

    //get all data from the firebase using realtime listener, then check if the deviceID is not the same as ours
    //add all the other data to a list of otherPlayers, then refresh that list as well
    onValue(dbRefDownload, (snapshot) => {
      const playerData = snapshot.val()
      for (let key in playerData)
      { this.otherPlayersObjects[playerData[key].deviceID] = playerData[key]}
    });

    //then we just add these players like usual in the animation loop
  }

  syncCamera(object: CANNON.Body, camera: THREE.PerspectiveCamera, offsetX: number, offsetY: number, offsetZ: number)
  {
    //just move the camera to the position + offset
    camera.position.set(object.position.x + offsetX, object.position.y + offsetY, object.position.z + offsetZ)
  }

  syncCameraToPlayer()
  {
    const offsetZ = 30;
    const setY = 20;
    this.camera.position.set(this.player.tBody.position.x, setY, this.player.tBody.position.z + offsetZ);
  }

  keysDown: string[] = []
  startMovementListeners()
  {
    document.onkeydown = ($e) =>  //so there is only ever 1 key of 1 type in the array
    { if (this.keysDown.includes($e.key) == false) this.keysDown.push($e.key); }
    document.onkeyup = ($e) =>
    { this.keysDown.splice(this.keysDown.indexOf($e.key), 1); }
  }
}

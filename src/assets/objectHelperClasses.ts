import * as CANNON from 'cannon-es';
import * as THREE from 'three';

//These classes just help you quickly initialize new objects
//For example this is how you initalize a new sphere:

/*  const testSphere = new sphere();
    testSphere.createObject(this.scene, this.world, 5, 0xFF00FF, 2);
    testSphere.tBody.position.set(0, 15, 5); //you can then edit the threejs and cannon bodies separtely 
    testSphere.updateCANNONPosition();
*/

//This is how to initalize a box:

/*  const testBox = new box();
    testBox.createObject(this.scene, this.world, {width: 10, height: 10, depth: 10}, 0xFF0000, 2);
*/


class cannonObject
{
    colour: THREE.ColorRepresentation = 0xFFFFFF;
    mass: number = 1;
    id?: number = undefined;

    bearing: {x: number, y: number, z: number} = {x: 0, y: 0, z: 0}; //bearing for each axis, how many degrees from north / 0

    //This class is just to initialize the objects, then you can access the regular bodies here:
    tBody: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]> = new THREE.Mesh(); //Three Body
    cBody: CANNON.Body = new CANNON.Body(); //Cannon Body

    updateCANNONPosition() //usually used after initalization when you just need to position the object using three coordinates
    {  this.cBody.position.set(this.tBody.position.x, this.tBody.position.y, this.tBody.position.z);  this.cBody.quaternion.set(this.tBody.quaternion.x, this.tBody.quaternion.y, this.tBody.quaternion.z, this.tBody.quaternion.w); }
    updateTHREEPosition() //usually already done by game loop so you don't need to do this
    {  this.tBody.position.set(this.cBody.position.x, this.cBody.position.y, this.cBody.position.z); this.tBody.quaternion.set(this.cBody.quaternion.x, this.cBody.quaternion.y, this.cBody.quaternion.z, this.cBody.quaternion.w); }

    updateObjectBearing()
    {
        //first need to convert the bearings to an actual degree value
        const angleX = (360 - this.bearing.x) % 360;
        const angleY = (360 - this.bearing.y) % 360;
        const angleZ = (360 - this.bearing.z) % 360;

        //need to convert to Euler values, (Math.PI/2) = 90 Degrees
        const eulerX = (Math.PI/2) * (angleX / 90);
        const eulerY = (Math.PI/2) * (angleY / 90);
        const eulerZ = (Math.PI/2) * (angleZ / 90);
        
        this.cBody.quaternion.setFromEuler(eulerX % 90, eulerY % 90, eulerZ % 90);
    }

    remove(scene: THREE.Scene, world: CANNON.World)
    {
        //removes it from threejs scene and cannon scene
        scene.remove(this.tBody);
        world.removeBody(this.cBody);
    }
}

export class sphere extends cannonObject //creating a sphere class so it is easy to create and update elements, and helps to keep it organized
{
    //we can set default values here:
    radius: number = 5;

    constructor()  { super(); }
    createObject(scene: THREE.Scene, world: CANNON.World, radius?: number, colour?: THREE.ColorRepresentation, mass?: number, customThreeObject?: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>, customCannonObject?: CANNON.Body) //get other parameters from self
    {
        if (radius != null) this.radius = radius;
        if (colour != null) this.colour = colour;
        if (mass != null) this.mass = mass;

        //create three object:
        const tGeo = new THREE.SphereGeometry(this.radius);
        const tMat = new THREE.MeshStandardMaterial({ color: this.colour, wireframe: false });
        const tObject = new THREE.Mesh(tGeo, tMat);
        this.tBody = tObject;
        if (customThreeObject != null) //overriding the three object which was just created
        { this.tBody = customThreeObject; }

        //create cannon object:
        const cGeo = new CANNON.Sphere(this.radius!);
        const cBody = new CANNON.Body( { mass: this.mass } )
        cBody.addShape(cGeo);
        this.cBody = cBody;
        if (customCannonObject != null)
        { this.cBody = customCannonObject; }

        if (this.id != null)
        { this.tBody.id = this.id;this.cBody.id = this.id; }

        scene.add(this.tBody);
        world.addBody(this.cBody);
    }
}
export class box extends cannonObject //same thing but for boxs
{
    dimensions: {width: number, height: number, depth: number} = {width: 5, height: 5, depth: 5};

    constructor()  { super(); }
    createObject(scene: THREE.Scene, world: CANNON.World, dimensions?: {width: number, height: number, depth: number} , colour?: THREE.ColorRepresentation, mass?: number, customThreeObject?: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>, customCannonObject?: CANNON.Body) //get other parameters from self
    {
        if (dimensions != null) this.dimensions = dimensions;
        if (colour != null) this.colour = colour;
        if (mass != null) this.mass = mass;

        const tGeo = new THREE.BoxGeometry(this.dimensions.width, this.dimensions.height, this.dimensions.depth);
        const tMat = new THREE.MeshStandardMaterial({ color: this.colour, wireframe: false });
        const tObject = new THREE.Mesh(tGeo, tMat);
        this.tBody = tObject;
        if (customThreeObject != null) //overriding the three object which was just created
        { this.tBody = customThreeObject; }

        const cGeo = new CANNON.Box( new CANNON.Vec3(this.dimensions.width / 2, this.dimensions.height / 2, this.dimensions.depth / 2) )
        const cBody = new CANNON.Body( { mass: this.mass } )
        cBody.addShape(cGeo);
        this.cBody = cBody;
        if (customCannonObject != null)
        { this.cBody = customCannonObject; }

        if (this.id != null)
        { this.tBody.name = String(this.id); this.cBody.id = this.id; }

        scene.add(this.tBody);
        world.addBody(this.cBody);
    }
}
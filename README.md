# Lobby Game

## This project was to learn about THREEJS working with CANNONJS to create physics, and to also learn about creating multiplayer games which can support many people at once

Basically you just shoot using the mouse pointer, and try and impulse people off of the platform.

URL: https://lobbygame.azurewebsites.net

### Controls
- WASD to move 
- Press Q to toggle Shoot Mode

### Shoot Mode
In this mode you just click somewhere on the platform, or another player, and it will launch an impulse which will push the players around it away from it.

### Performance
If performace is bad, then you can add these parameters to improve it:
- shadows=false
- FPS=30 (Default is 60fps)

If there are too many people online, then you can reset the server with the button in the top-left. The password is nothing123.\
This will just remove all players from the database, however the userIDs will still be stored on local storage, there may be some issues however and everyone has to reload their page.

Here are some previews:
![Preview 1](https://github.com/AryaaSk/lobbyGame/blob/master/Previews/Preview1.png?raw=true)

![Preview 2](https://github.com/AryaaSk/lobbyGame/blob/master/Previews/Preview2.png?raw=true)

### TODO:
- Allow players to customize their colour, will just have to save colour in local storage and upload as one time data to the database, then can just render the player's colour when rendering their object in the animation loop.
- Allow player to enter a name, similar to colour, however will also have to add a name tag above the player.
- Improve mobile controls, for some reason touch listeners aren't working properly and the user cannot jump and move the joystick at the same time.
- Creating an actual player object in 3D modelling software such as Blender, and using that as the player object instead of just a cube.
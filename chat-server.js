// Require the packages we will use:
var http = require("http"),
	socketio = require("socket.io"),
	fs = require("fs");

// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function(req, resp){
	// This callback runs when a new connection is made to our HTTP server.

	fs.readFile("client.html", function(err, data){
		// This callback runs when the client.html file has been read from the filesystem.

		if(err) return resp.writeHead(500);
		resp.writeHead(200);
		resp.end(data);
	});
});
app.listen(3456);

var Room = function (private, roomName, creator) { // public room object
	this.private = private; // verify whether this room is public or private
	this.roomName = roomName; // room name
	this.creator = creator; // creator of this room
	this.joinedUser = []; // all users in this room
	this.banList = []; // all ban users in this room
}
var PrivateRoom = function (private, roomName, password, creator) { // private room object
	this.private = private; // verify whether this room is public or private
	this.roomName = roomName; // room name
	this.password = password; // private room need password
	this.creator = creator; // creator of this room
	this.joinedUser = []; // all users in this room
	this.banList = []; // all ban users in this room
}
var User = function(name, socketId) { // user object
	this.name = name; // username
	this.socketId = socketId; // socket id
	this.stayRoom = "lobby"; // current room that user stay
	this.prohibit = false; // whether user's messages are prohibited in current room
	this.banRoom = []; // all banned room name
}

// Global parameters for users and rooms.
var allUsers = []; // all user objects
var allRooms = []; // all room objects

// Do the Socket.IO magic:
var io = socketio.listen(app);
io.sockets.on("connection", function(socket){
	// This callback runs when a new Socket.IO connection is established.

	socket.on('message_to_server', function(data) {
		// This callback runs when the server receives a new message from the client.
		console.log("message: "+data["message"]); // log it to the Node.JS output
		var currentRoomName = Object.keys(socket.rooms)[1]; // get current room name
		for(var i = 0; i < allUsers.length;i++){ // get current user information
			if(allUsers[i].name === data["currentUser"]){
				var currentUser = allUsers[i];
			}
		}
		io.to(currentRoomName).emit("message_to_client",{message:data["message"], currentUser:currentUser }) // broadcast the message to other users
	});

	socket.on('image_to_server', function(data) {
		// This callback runs when the server receives a new message from the client.
		console.log("image: "+data["image"]); // log it to the Node.JS output
		var currentRoomName = Object.keys(socket.rooms)[1]; // get current room name
		io.to(currentRoomName).emit("image_to_client",{image:data["image"], currentUser:data['currentUser'] }) // broadcast the message to other users
	});

	socket.on('privateMessage_to_server', function(data) {
		// This callback runs when the server receives a new message from the client.
		console.log("privateMessage: "+data["privateMessage"]); // log it to the Node.JS output
		var currentRoomName = Object.keys(socket.rooms)[1]; // get current room name
		io.to(currentRoomName).emit("privateMessage_to_client",{ privateMessage:data['privateMessage'], currentUser:data['currentUser'], receiveUser:data['receiveUser'] }) // broadcast the message to other users
	});

	socket.on('login_to_server',function(data){
		//console.log("username: "+ data['username']);
		var name = data["username"];
		var socketId = socket.id;
		var stayRoom = "lobby";
		var prohibit = false;
		//var createdRoom = [];
		user = new User(name,socketId,stayRoom,prohibit); // create a new user object
		allUsers.unshift(user); // put the new user object into allUsers array
		io.sockets.emit("showRoom_to_client", {allRooms:allRooms});  // send message to new user
	});

	socket.on('createRoom_to_server',function(data){ // create a new public room
		var unique = true;
		var currentUser = data['currentUser'];
		for(var i = 0;i < allRooms.length;i++){ // verify room name is unique
			if(data['newRoomName'] === allRooms[i]){ // if this room name exist
				var errorMessage = "exist room name";
				unique = false; // unique room name flag
				io.sockets.emit("error_to_client", {errorMessage:errorMessage,currentUser:currentUser }); // return error message
				break;
			}
		}
		if(unique){ // if room name is unique, create a new room
			var private = false;
			var roomName = data['newRoomName'];
			var creator = data['currentUser'];
			newRoom = new Room(private,roomName,creator); // create a new room object
			allRooms.unshift(newRoom); // put room object into allRooms array
			io.sockets.emit("showRoom_to_client", {allRooms:allRooms});
		}
	});

	socket.on('createPrivateRoom_to_server',function(data){ // create private room
		var unique = true;
		if(data['password'] === null){ // if password is null, return error message
			var errorMessage = "empty password";
			io.sockets.emit("privateError_to_client", {errorMessage:errorMessage });
		} else {
			for(var i = 0;i < allRooms.length;i++){ // verify whether room name is unique
				if(data['newPrivateRoomName'] === allRooms[i]){
					var errorMessage = "exist room name";
					unique = false; // unique room name flag
					io.sockets.emit("privateError_to_client", {errorMessage:errorMessage }); // return error message
					break;
				}
			}
			if(unique){ // if room name if unique, create a new public room
				var private = true;
				var roomName = data['newPrivateRoomName'];
				var password = data['password'];
				var creator = data['currentUser'];
				newPrivateRoom = new PrivateRoom(private,roomName,password,creator); // create a new room object
				allRooms.unshift(newPrivateRoom); // put this new room object into allRooms array
				io.sockets.emit("showRoom_to_client", {allRooms:allRooms});
			}
		}
	});

	socket.on('enterRoom_to_server', function(data) { // enter room
		// This callback runs when the server receives a new message from the client.
		var whichRoom = data["whichRoom"];
		var currentUser = data["currentUser"];
		var whichRoomName = whichRoom.roomName;
		var banFlag = false;
		for(var j=0;j<allUsers.length;j++){ // get enter user's information
			if(allUsers[j].name === currentUser){
				var enterUser = allUsers[j];
			}
		}
		for(var i=0;i<enterUser.banRoom.length;i++){ // verify whether this user if banned into this room
			if(enterUser.banRoom[i] === whichRoom.roomName){
				banFlag = true; // ban into this room flag
			}
		}
		if(banFlag){ // if banned into this room, return error messgae
			console.log(banFlag);
			io.sockets.emit("banRoomError_to_client", {whichRoom:whichRoom,currentUser:currentUser});
		} else { // if not banned into this room
			console.log(whichRoom);
			for(var i = 0;i < allUsers.length;i++){ // get all users in this room
				if(allUsers[i].name === currentUser){
					allUsers[i].stayRoom = whichRoom.roomName;
				}
			}
			socket.join(whichRoomName);
			for(var j = 0;j < allUsers.length;j++){
				if(allUsers[j].stayRoom === whichRoomName){
					whichRoom.joinedUser.push(allUsers[j].name); // put all usernames into joinedUser array
				}
			}
			io.sockets.emit("enterRoom_to_client",{whichRoom:whichRoom}); // broadcast the message to other users
		}
	});

	socket.on("prohibitUser_to_server", function(data){ // prohibit sending messages
		var userName = data["userName"];
		for(var i=0;i<allUsers.length;i++){ // verify whether this user is prohibited in this room
			if(allUsers[i].name === userName){
				allUsers[i].prohibit = true;
				var prohibitUser = allUsers[i]; // get prohibited user's information
			}
		}
		io.sockets.emit("prohibitUser_to_client", {prohibitUser:prohibitUser});
	});


	socket.on("kickUser_to_server", function(data){ // kick user
		var userName = data["userName"];
		for(var i=0;i<allUsers.length;i++){
			if(allUsers[i].name === userName){ // if user is kicked, return back to Lobby
			  var kickWhichRoomName = allUsers[i].stayRoom;
				allUsers[i].stayRoom = "lobby";
			}
		}
		for(var j=0;j < allRooms.length;j++){ // get kicked room's information
			if(allRooms[j].roomName === kickWhichRoomName){
				kickWhichRoom = allRooms[j];
			}
		}
		socket.leave(kickWhichRoomName,() => { // kicked user will leave current room
			for(var k = 0;k < allUsers.length;k++){
				if(allUsers[k].stayRoom === kickWhichRoomName){
					kickWhichRoom.joinedUser.push(allUsers[k].name); // update joinedUser array
				}
			}
			io.sockets.emit("kickUser_to_client", {kickWhichRoom:kickWhichRoom,userName:userName});
		});
	});

	socket.on("banUser_to_server", function(data){ // ban user
		var userName = data["userName"];
		var currentRoom = data["currentRoom"];
		for(var i = 0;i<allRooms.length;i++){ // get banned room's information
			if(allRooms[i].roomName === currentRoom){
				var banCurrentRoom = allRooms[i];
			}
		}
		for(var j=0;j<allUsers.length;j++){ // put banned room's name into banRoom array
			if(allUsers[j].name === userName){
				var bannedUser = allUsers[j];
				bannedUser.banRoom.unshift(currentRoom);
			}
		}
		banCurrentRoom.banList.push(userName); // put banned username into banList array
		io.to(banCurrentRoom.roomName).emit("banUser_to_client", {banCurrentRoom:banCurrentRoom});
	});

	socket.on("newAd_to_server", function(data){ // change password
		var newAd = data["newAd"];
		var currentUser = data["currentUser"];
		var currentRoom = data["currentRoom"];
		for(var i = 0;i<allRooms.length;i++){ // get changed password room's information
			if(allRooms[i].roomName === currentRoom){
				var newAdRoom = allRooms[i];
			}
		}
		if(newAdRoom.creator === currentUser){ // verify whether current user is creator of this room
			io.to(newAdRoom.roomName).emit("newAd_to_client", {newAd:newAd,newAdRoom:newAdRoom,currentUser:currentUser});
		} else { // change password error messages
			io.to(newAdRoom.roomName).emit("newAdError_to_client", {newAdRoom:newAdRoom,currentUser:currentUser});
		}
	});

	socket.on("changePassword_to_server", function(data){ // change password
		var newPassword = data["newPassword"];
		var currentUser = data["currentUser"];
		var currentRoom = data["currentRoom"];
		for(var i = 0;i<allRooms.length;i++){ // get changed password room's information
			if(allRooms[i].roomName === currentRoom){
				var changePasswordRoom = allRooms[i];
			}
		}
		if(changePasswordRoom.creator === currentUser){ // verify whether current user is creator of this room
			changePasswordRoom.password = newPassword; // change password Successfully
			io.to(changePasswordRoom.roomName).emit("changePassword_to_client", {changePasswordRoom:changePasswordRoom,currentUser:currentUser});
		} else { // change password error messages
			io.to(changePasswordRoom.roomName).emit("changePasswordError_to_client", {changePasswordRoom:changePasswordRoom,currentUser:currentUser});
		}
	});

	socket.on('exitRoom_to_server', function(data) { // exit current room
		// This callback runs when the server receives a new message from the client.
		var exitRoomName = data['exitRoomName'];
		var exitWhichRoom = {};
		var currentUser = data['currentUser'];
		for(var k = 0;k<allUsers.length;k++){
			if(allUsers[k].name === currentUser){
				allUsers[k].stayRoom = "lobby"; // this user return back to Lobby
				allUsers[k].prohibit = false; // cancel prohibit
			}
		}
		for(var j=0;j < allRooms.length;j++){ // get exit room's information
			if(allRooms[j].roomName === exitRoomName){
				exitWhichRoom = allRooms[j];
			}
		}
		socket.leave(exitRoomName,() => { // this user will leave room
			for(var i = 0;i < allUsers.length;i++){
				if(allUsers[i].stayRoom === exitRoomName){
					exitWhichRoom.joinedUser.push(allUsers[i].name);
				}
			}
			io.to(exitRoomName).emit("exitRoom_to_client", {exitWhichRoom:exitWhichRoom});
		});
	});
});

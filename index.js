var port = process.env.PORT || 3000;
var express = require("express");
var app = express();
var server = require("http").createServer(app);
var io = require("socket.io")(server);
var shortid = require("shortid");
const mongoose = require("mongoose");
const SHA256 = require("crypto-js/sha256");
// mongodb://ADMIN:ADMIN@54.39.21.5:27020/timetravel
// mongodb://ADMIN:ADMIN@54.39.21.5:27020/?authSource=admin
mongoose
  .connect("mongodb://root:rootpassword@54.39.21.5:27020/?authSource=admin")
  .then((db) => console.log("Connected to DB"))
  .catch((err) => console.log("DB ERROR: ", err));

var ClientsIds = [];
var Rooms = [];
var Maps = [];

const User = require("../TimeTravelServer/models/user.js");
const map = require("../TimeTravelServer/models/map.js");

app.post("/Clients", (req, res, next) => {
  res.json(ClientsIds);
});
app.post("/Rooms", (req, res, next) => {
  res.json(Rooms);
});
app.post("/Maps", (req, res, next) => {
  res.json(Maps);
});

server.listen(port);

console.log("Run on " + port);

function Comillas(value) {
  var val = value.replace('"', "");
  val = val.replace('"', "");
  val = val.replace("'", "");
  val = val.replace("'", "");
  return val;
}

function findUser(email, password) {
  var user = null;
  User.find((err, res) => {
    for (var i = 0; i < res.length; i++) {
      console.log(
        res[i].email,
        res[i].password,
        email,
        SHA256(password).toString()
      );
      if (
        res[i].email == email &&
        res[i].password == SHA256(password).toString()
      ) {
        console.log("Login");
        user = res[i];
        break;
      }
    }
  });
  return user;
}

io.on("connection", (socket) => {
  socket.thisClientId = shortid.generate();
  socket.inGame = false;
  socket.room = "Login";
  socket.join(socket.room);
  ClientsIds.push(socket.thisClientId);
  socket.emit("setId", { id: socket.thisClientId });

  socket.on("createRoom", (data) => {
    map.find({ id: Comillas(data.roomMap) }, (err, res) => {
      if (res.length) {
        console.log("New room");
        var room = {
          roomId: shortid.generate(),
          roomName: Comillas(data.roomName),
          roomMapId: Comillas(data.roomMap),
          roomPlayers: 0,
          roomMaxPlayers: 8,
          roomPlayersId: [],
          roomSocketOrigin: socket.id,
        };
        Rooms.push(room);
        socket.leave(socket.room);
        socket.room = room.roomId;
        socket.join(socket.room);
        map.find((err, res) => {
          for (var i = 0; i < res.length; i++) {
            if (res[i].id == room.roomMapId) {
              var objects = res[i].objects;
              socket.emit("ConnectToRoom", {
                mapObjects: objects,
                roomId: room.roomId,
              });
            }
          }
        });
      }
    });
  });

  socket.on("joinRoom", (data) => {
    var mapID = "";
    var players = 0;
    var maxPlayers = 0;
    Rooms.forEach((room) => {
      if (room.roomId == Comillas(data.roomId)) {
        mapID = room.roomMapId;
        players = room.roomPlayers;
        maxPlayers = room.roomMaxPlayers;
      }
    });

    if (players < maxPlayers) {
      socket.leave(socket.room);
      socket.room = Comillas(data.roomId);
      socket.join(socket.room);
      map.find((err, res) => {
        for (var i = 0; i < res.length; i++) {
          if (res[i].id == mapID) {
            var objects = res[i].objects;
            socket.emit("ConnectToRoom", {
              mapObjects: objects,
              roomId: mapID,
            });
            break;
          }
        }
      });
    }
  });

  socket.on("requestPlayers", (data) => {
    Rooms.forEach((room) => {
      if (room.roomId == socket.room) {
        room.roomPlayersId.forEach((id) => {
          socket.emit("AddPlayer", id);
        });
        socket.broadcast.to(socket.room).emit("AddPlayer", {
          playerID: socket.thisClientId,
          user: socket.nickname,
        });
        socket.broadcast
          .to(socket.room)
          .emit("NoRender", { playerID: socket.thisClientId });
        room.roomPlayersId.push({
          playerID: socket.thisClientId,
          user: socket.nickname,
        });
        room.roomPlayers++;
        if (room.roomPlayers > 1) {
          io.sockets.connected[room.roomSocketOrigin].emit(
            "RoomInfoRequest",
            {}
          );
        } else {
          room.roomSocketOrigin = socket.id;
        }
      }
    });
  });

  socket.on("RoomInfo", (data) => {
    socket.broadcast.to(socket.room).emit("RoomInfo", data);
  });
  socket.on("Pick", (data) => {
    io.sockets.in(socket.room).emit("Pick", data);
  });
  socket.on("Shoot", (data) => {
    io.sockets.in(socket.room).emit("Shoot", data);
  });

  socket.on("disconnect", () => {
    if (socket.room == "Login") {
      // Logout
    } else if (socket.room == "Lobby") {
    } else {
      io.sockets
        .in(socket.room)
        .emit("DeletePlayer", { playerID: socket.thisClientId });
      Rooms.forEach((room) => {
        if (room.roomId == socket.room) {
          room.roomPlayers--;
          room.roomPlayersId.forEach((id) => {
            if (id.playerID == socket.thisClientId) {
              room.roomPlayersId.splice(room.roomPlayersId.indexOf(id), 1);
            }
          });
        }
      });
    }

    ClientsIds.splice(ClientsIds.indexOf(socket.thisClientId), 1);
  });

  socket.on("DisconnectRoom", (data) => {
    Rooms.forEach((room) => {
      if (room.roomId == socket.room) {
        room.roomPlayers--;
        room.roomPlayersId.forEach((id) => {
          if (id.playerID == socket.thisClientId) {
            room.roomPlayersId.splice(room.roomPlayersId.indexOf(id), 1);
          }
        });
      }
    });

    socket.leave();
    socket.room = "Lobby";
    socket.join(socket.room);
  });

  socket.on("UpdatePlayer", (data) => {
    socket.broadcast.to(socket.room).emit("UpdatePlayer", data);
  });

  socket.on("Render", (data) => {
    socket.broadcast.to(socket.room).emit("Render", data);
  });
  socket.on("NoRender", (data) => {
    socket.broadcast.to(socket.room).emit("NoRender", data);
  });
  socket.on("Die", (data) => {
    socket.broadcast.to(socket.room).emit("Die", data);
  });

  socket.on("Login", (data) => {
    var login = false;
    var demail = Comillas(data.email);
    var dpassword = Comillas(data.password);
    User.find((err, res) => {
      for (var i = 0; i < res.length; i++) {
        if (
          res[i].email == demail &&
          res[i].password == SHA256(dpassword).toString()
        ) {
          var u = res[i];
          var dnickname = res[i].nickname;
          socket.emit("LoginResponse", { login: true, u });
          socket.nickname = dnickname;
          login = true;
          socket.leave(socket.room);
          socket.room = "Lobby";
          socket.join(socket.room);
          break;
        }
      }
    });
    if (!login) {
      socket.emit("LoginResponse", { login: false });
    }
    socket.emit("RoomsUpdate", { Rooms: Rooms });
  });
  socket.on("Register", (data) => {
    var nick = Comillas(data.nickname);
    var demail = Comillas(data.email);
    var dpassword = Comillas(data.password);

    User.find({ nickname: nick }, (err, res) => {
      if (!res.length) {
        User.find({ email: demail }, (err0, res0) => {
          if (!res0.length) {
            var newUser = new User();
            newUser.nickname = nick;
            newUser.email = demail;
            newUser.password = SHA256(dpassword).toString();
            newUser.save();
            socket.emit("RegisterResponse", { register: true });
          } else {
            socket.emit("RegisterResponse", { register: false });
          }
        });
      } else {
        socket.emit("RegisterResponse", { register: false });
      }
    });
  });
  socket.on("SaveMap", (data) => {
    var newMap = new map();
    newMap.id = shortid.generate();
    newMap.name = Comillas(data.mapName);

    newMap.isPublic =
      Comillas(data.public) === "True" || Comillas(data.public) === "true";
    newMap.objects = data.objects;
    newMap.save();
  });

  // Gets's

  socket.on("GetRoomsAMaps", (data) => {
    socket.emit("RoomsUpdate", { rooms: Rooms });
    socket.emit("MapsUpdate", { maps: Maps });
  });

  socket.on("OpenMapEditor", (data) => {
    socket.emit("OpenMapEditor", { open: true });
  });
});

setInterval(() => {
  io.sockets.in("Lobby").emit("RoomsUpdate", { rooms: Rooms });
  Maps = [];
  map.find((err, res) => {
    for (var i = 0; i < res.length; i++) {
      Maps.push({ MapID: res[i].id, MapName: res[i].name });
    }
    io.sockets.in("Lobby").emit("MapsUpdate", { maps: Maps });
  });

  Rooms.forEach((room) => {
    io.in(room.roomId).clients((error, clients) => {
      if (error) throw error;
      if (clients.length > 0) {
        io.sockets.connected[clients[0]].emit("Tick", {});
      }
    });
  });
}, 10000);

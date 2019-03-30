const mongoose = require('mongoose');
const schema = mongoose.Schema;

const User = new mongoose.Schema({
    email: String,
    nickname: String,
    password: String,
    money: {type:Number, default:0},
    kills: {type:Number, default:0},
    deads: {type:Number, default:0},
    timePlaying: {type:Number, default:0},
});

module.exports = mongoose.model('User',User);
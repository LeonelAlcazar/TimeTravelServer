const mongoose = require('mongoose');
const schema = mongoose.Schema;

const map = new mongoose.Schema({
    id: String,
    name: String,
    isPublic: Boolean,
    objects: [],
});

module.exports = mongoose.model('map',map);
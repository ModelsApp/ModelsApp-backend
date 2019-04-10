var MongoClient = require('mongodb').MongoClient;
var config = require('./index');

var url = config.mongoURI;

function MongoPool(){}

var p_db;

function initPool(cb){
  MongoClient.connect(url, {native_parser:true}, function(err, client) {
    var db = client.db();
    if (err) throw err;

    p_db = db;
    if(cb && typeof(cb) == 'function') cb(p_db);
  });
  return MongoPool;
}

MongoPool.initPool = initPool;

function getInstance(cb){
  if(!p_db){
    initPool(cb);
  }
  else{
    if(cb && typeof(cb) == 'function') cb(p_db);
  }
}
MongoPool.getInstance = getInstance;

module.exports = MongoPool;

var MongoClient = require('mongodb').MongoClient;
var config = require('./index');
var url = config.mongoURI;

function MongoPool(){}

var p_db;
let p_client;

function initPool(cb){
  MongoClient.connect(url, { useNewUrlParser: true }, function(err, client) {
    p_client = client;
    var db = client.db();
    if (err) throw err;

    p_db = db;
    if(cb && typeof(cb) == 'function') cb(p_db, p_client);
  });
  return MongoPool;
}

MongoPool.initPool = initPool;

function getInstance(cb){
  if(!p_db){
    initPool(cb);
  }
  else{
    if(cb && typeof(cb) == 'function') cb(p_db, p_client);
  }
}
MongoPool.getInstance = getInstance;

module.exports = MongoPool;

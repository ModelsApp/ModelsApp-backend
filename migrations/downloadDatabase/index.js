const fs = require('fs');

const downloadDatabase = async (entities) => {
  for (entity of Object.keys(entities)) {
    const data = await entities[entity].find({}).toArray();
    fs.writeFile(`migrations/db/${entity}`, JSON.stringify(data), (err) => {
      if (err) console.log(err);
      console.log(`${entity} downloaded`);
    });
  }
};

module.exports = downloadDatabase;

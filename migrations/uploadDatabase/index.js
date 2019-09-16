const fs = require('fs');
const readline = require('readline');

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }))
}

const uploadDatabase = async (entities) => {
  const ans = await askQuestion('Are you sure you want to upload database? (Y/n)');
  if (ans !== 'Y' && ans !== 'yes') {
    console.log('Aborting db upload');
    return;
  }
  for (entity of Object.keys(entities)) {
    const data = fs.readFileSync(`migrations/db/${entity}`, 'utf8');
    await entities[entity].insertMany(JSON.parse(data));
  }
};

module.exports = uploadDatabase;

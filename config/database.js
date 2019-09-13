const MongoClient = require('mongodb').MongoClient;

class Database {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.db = null;
  }

  async getDatabase() {
    if (!this.db) {
      await this.connect();
    }

    return this.db;
  }

  async getClient() {
    if (!this.client) {
      await this.connect();
    }

    return this.client;
  }

  async connect() {
    const client = await MongoClient.connect(this.config.mongoURI, { useNewUrlParser: true });
    this.client = client;
    this.db = client.db();
  }
}

module.exports = Database;

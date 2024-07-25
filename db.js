  const { MongoClient } = require('mongodb');

  const uri = 'mongodb+srv://Brandon:Brandonxd890@atlascluster.ypjfqgw.mongodb.net/Perfum?retryWrites=true&w=majority';

  const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  async function conectar() {
    try {
      await client.connect();
      console.log('Conectado a MongoDB Atlas');
    } catch (error) {
      console.error('Error al conectar a MongoDB Atlas:', error);
      process.exit(1);
    }
  }

  module.exports = { client, conectar };

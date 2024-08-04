const express = require('express');
const cors = require('cors');
const { client, conectar } = require('./db');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const paypal = require('paypal-rest-sdk');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

paypal.configure({
  mode: 'sandbox',
  client_id: process.env.PAYPAL_CLIENT_ID,
  client_secret: process.env.PAYPAL_CLIENT_SECRET
});

cloudinary.config({
  cloud_name: 'dt6uyamcm',
  api_key: '462617617766453',
  api_secret: 'rCJThcGpHO-iiccbzZULzNUyhN0',
  secure: true
});

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage });

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Ruta para enviar correos
app.post('/api/send-email', (req, res) => {
  const { to, subject, text } = req.body;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error al enviar el correo:', error);
      return res.status(500).json({ error: 'Error al enviar el correo' });
    }
    res.json({ message: 'Correo enviado exitosamente' });
  });
});

// Ruta para subir archivos a Cloudinary
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      throw new Error('No se recibió ningún archivo');
    }

    cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
      if (error) {
        return res.status(500).json({ error: 'Error al subir el archivo a Cloudinary', details: error.message });
      }
      res.json({ url: result.secure_url });
    }).end(req.file.buffer);
  } catch (error) {
    console.error('Error al subir el archivo:', error.message);
    res.status(500).json({ error: 'Error al subir el archivo', details: error.message });
  }
});

// Nueva ruta para guardar URLs de imágenes
app.post('/api/adminConfig/images', async (req, res) => {
  const { images } = req.body;

  try {
    const db = client.db();
    const result = await db.collection('Informacion').updateOne(
      { Titulo: "Imágenes" },
      { $set: { Contenido: images } },
      { upsert: true }
    );

    res.json({ message: 'URLs de imágenes guardadas exitosamente', result });
  } catch (error) {
    console.error('Error al guardar URLs de imágenes:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para obtener el logo
app.get('/api/adminConfig/logo', async (req, res) => {
  try {
    const db = client.db();
    const logo = await db.collection('Informacion').findOne({ Titulo: "Logo" });
    if (!logo) {
      return res.status(404).json({ error: 'Logo no encontrado' });
    }
    res.json(logo);
  } catch (error) {
    console.error('Error al obtener el logo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Nueva ruta para guardar el logo
app.post('/api/adminConfig/logo', async (req, res) => {
  const { logo } = req.body;

  try {
    const db = client.db();
    const result = await db.collection('Informacion').updateOne(
      { Titulo: "Logo" },
      { $set: { Contenido: logo } },
      { upsert: true }
    );

    res.json({ message: 'Logo guardado exitosamente', result });
  } catch (error) {
    console.error('Error al guardar el logo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Nueva ruta para obtener los colores
app.get('/api/adminConfig/colors', async (req, res) => {
  try {
    const db = client.db();
    const colors = await db.collection('Informacion').findOne({ Titulo: "Colores" });
    if (!colors) {
      return res.status(404).json({ error: 'Colores no encontrados' });
    }
    res.json(colors);
  } catch (error) {
    console.error('Error al obtener los colores:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Nueva ruta para guardar los colores
app.post('/api/adminConfig/colors', async (req, res) => {
  const { primary, header } = req.body;

  try {
    const db = client.db();
    const result = await db.collection('Informacion').updateOne(
      { Titulo: "Colores" },
      { $set: { Contenido: { primary, header } } },
      { upsert: true }
    );

    res.json({ message: 'Colores guardados exitosamente', result });
  } catch (error) {
    console.error('Error al guardar los colores:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para crear pago de PayPal
app.post('/api/paypal/create-payment', (req, res) => {
  const { total, currency } = req.body;

  const create_payment_json = {
    intent: 'sale',
    payer: {
      payment_method: 'paypal'
    },
    redirect_urls: {
      return_url: 'http://localhost:4200/success',
      cancel_url: 'http://localhost:4200/cancel'
    },
    transactions: [{
      amount: {
        currency: 'USD',
        total: (total / 20).toFixed(2) // Assuming 1 USD = 20 MXN
      },
      description: 'Compra en tu tienda'
    }]
  };

  paypal.payment.create(create_payment_json, (error, payment) => {
    if (error) {
      res.status(500).json({ error });
    } else {
      res.json({ paymentID: payment.id });
    }
  });
});

// Ruta para ejecutar pago de PayPal
app.post('/api/paypal/execute-payment', (req, res) => {
  const { paymentID, payerID, total } = req.body;

  const execute_payment_json = {
    payer_id: payerID,
    transactions: [{
      amount: {
        currency: 'USD',
        total: (total / 20).toFixed(2) // Assuming 1 USD = 20 MXN
      }
    }]
  };

  paypal.payment.execute(paymentID, execute_payment_json, (error, payment) => {
    if (error) {
      res.status(500).json({ error });
    } else {
      res.json({ payment });
    }
  });
});

// Ruta para guardar pedidos
app.post('/api/pedidos', async (req, res) => {
  const { correo, cart, total, direccion } = req.body;

  try {
    const db = client.db();
    const pedido = {
      correo,
      cart,
      total,
      direccion,
      completado: false, // Nuevo campo para indicar si el pedido está completado
      createdAt: new Date()
    };

    const result = await db.collection('Pedidos').insertOne(pedido);

    res.status(201).json({ message: 'Pedido guardado exitosamente', pedidoId: result.insertedId });
  } catch (error) {
    console.error('Error al guardar el pedido:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/pedidos', async (req, res) => {
  const { correo } = req.query;

  try {
    const db = client.db();
    let pedidos;
    if (correo) {
      pedidos = await db.collection('Pedidos').find({ correo }).toArray();
    } else {
      pedidos = await db.collection('Pedidos').find().toArray();
    }

    if (!pedidos || pedidos.length === 0) {
      return res.status(404).json({ error: 'No se encontraron pedidos' });
    }
    res.json(pedidos);
  } catch (error) {
    console.error('Error al obtener pedidos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para marcar un pedido como completado
app.put('/api/pedidos/completar/:id', async (req, res) => {
  const pedidoId = req.params.id;

  try {
    const db = client.db();
    const result = await db.collection('Pedidos').updateOne(
      { _id: new ObjectId(pedidoId) },
      { $set: { completado: true } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    res.json({ message: 'Pedido completado exitosamente' });
  } catch (error) {
    console.error('Error al completar el pedido:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para agregar productos
app.post('/api/agregarProducto', async (req, res) => {
  const { Nombre, Precio, imagen } = req.body;

  try {
    const db = client.db();
    const newProducto = {
      Nombre,
      Precio,
      imagen
    };

    const result = await db.collection('Productos').insertOne(newProducto);
    res.status(201).json({ message: 'Producto agregado exitosamente', productoId: result.insertedId });
  } catch (error) {
    console.error('Error al agregar el producto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Rutas para actualizar y eliminar productos
app.put('/api/productos/:id', async (req, res) => {
  const productoId = req.params.id;
  const { Nombre, Precio, imagen } = req.body;

  try {
    const db = client.db();
    const result = await db.collection('Productos').updateOne(
      { _id: new ObjectId(productoId) },
      { $set: { Nombre, Precio, imagen } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json({ message: 'Producto actualizado exitosamente' });
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.delete('/api/productos/:id', async (req, res) => {
  const productoId = req.params.id;

  try {
    const db = client.db();
    const result = await db.collection('Productos').deleteOne({ _id: new ObjectId(productoId) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json({ message: 'Producto eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Rutas para la gestión de usuarios
app.post('/api/usuarios/enviarCodigoRecuperacion', async (req, res) => {
  const { correo } = req.body;
  const codigoRecuperacion = crypto.randomBytes(3).toString('hex').toUpperCase();

  try {
    const db = client.db();
    const usuario = await db.collection('Usuarios').findOne({ correo });

    if (!usuario) {
      return res.status(404).json({ error: 'Correo no encontrado' });
    }

    await db.collection('CodigosRecuperacion').insertOne({ correo, codigo: codigoRecuperacion, createdAt: new Date() });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: correo,
      subject: 'Código de Recuperación de Contraseña',
      text: `Tu código de recuperación es: ${codigoRecuperacion}`,
      html: `<strong>Tu código de recuperación es: ${codigoRecuperacion}</strong>`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error al enviar el correo:', error);
        return res.status(500).json({ error: 'Error al enviar el correo' });
      }
      res.json({ message: 'Código de recuperación enviado' });
    });
  } catch (error) {
    console.error('Error al enviar el código de recuperación:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/usuarios/verificarCodigoRecuperacion', async (req, res) => {
  const { correo, codigo } = req.body;

  try {
    const db = client.db();
    const codigoValido = await db.collection('CodigosRecuperacion').findOne({ correo, codigo });

    if (!codigoValido) {
      return res.status(401).json({ error: 'Código de recuperación incorrecto' });
    }

    const now = new Date();
    const codigoCreado = new Date(codigoValido.createdAt);
    const diferenciaTiempo = now - codigoCreado;
    const tiempoMaximo = 15 * 60 * 1000;

    if (diferenciaTiempo > tiempoMaximo) {
      return res.status(401).json({ error: 'Código de recuperación expirado' });
    }

    res.json({ message: 'Código de recuperación verificado' });
  } catch (error) {
    console.error('Error al verificar el código de recuperación:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/usuarios/cambiarPassword', async (req, res) => {
  const { correo, nuevaPassword } = req.body;

  try {
    const db = client.db();
    const hashedPassword = await bcrypt.hash(nuevaPassword, 10);
    
    const result = await db.collection('Usuarios').updateOne(
      { correo },
      { $set: { password: hashedPassword } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ message: 'Contraseña cambiada exitosamente' });
  } catch (error) {
    console.error('Error al cambiar la contraseña:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/productos', async (req, res) => {
  try {
    const db = client.db();
    const productos = await db.collection('Productos').find().toArray();
    res.json(productos);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/productos/:id', async (req, res) => {
  const productoId = req.params.id;

  try {
    const db = client.db();
    const producto = await db.collection('Productos').findOne({ _id: new ObjectId(productoId) });

    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json(producto);
  } catch (error) {
    console.error('Error al obtener producto por ID:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para agregar una reseña a un producto
app.post('/api/productos/:id/reviews', upload.single('image'), async (req, res) => {
  const productoId = req.params.id;
  const { nombre, rating, descripcion } = req.body;

  try {
    const db = client.db();
    let imageUrl = '';

    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }).end(req.file.buffer);
      });

      imageUrl = result.secure_url;
    }

    const review = { nombre, rating, descripcion, imageUrl, createdAt: new Date() };

    const result = await db.collection('Productos').updateOne(
      { _id: new ObjectId(productoId) },
      { $push: { reviews: review } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json(review);
  } catch (error) {
    console.error('Error al agregar la reseña:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/preguntasSecretas', async (req, res) => {
  try {
    const db = client.db();
    const preguntasSecretas = await db.collection('PreguntasSecretas').find().toArray();
    const preguntas = preguntasSecretas.map(p => p.Pregunta);
    res.json(preguntas);
  } catch (error) {
    console.error('Error al obtener preguntas secretas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/usuarios/register', async (req, res) => {
  const { nombre, correo, password, preguntaSecreta, respuestaSecreta } = req.body;

  try {
    const db = client.db();
    const existingUser = await db.collection('Usuarios').findOne({
      $or: [{ correo }, { nombre }]
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Correo o nombre de usuario ya registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedRespuestaSecreta = await bcrypt.hash(respuestaSecreta, 10);

    const newUser = {
      nombre,
      correo,
      password: hashedPassword,
      preguntaSecreta,
      respuestaSecreta: hashedRespuestaSecreta,
      isAdmin: false
    };

    const result = await db.collection('Usuarios').insertOne(newUser);
    res.status(201).json({ message: 'Usuario registrado exitosamente' });
  } catch (error) {
    console.error('Error al registrar usuario:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/usuarios/loginCorreo', async (req, res) => {
  const { correo, password } = req.body;

  try {
    const db = client.db();
    const usuario = await db.collection('Usuarios').findOne({ correo });

    if (!usuario) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const isPasswordValid = await bcrypt.compare(password, usuario.password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const { password: userPassword, ...userWithoutPassword } = usuario;

    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error al autenticar usuario:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/usuarios/recuperarPassword', async (req, res) => {
  const { correo, preguntaSecreta, respuestaSecreta } = req.body;

  try {
    const db = client.db();
    const usuario = await db.collection('Usuarios').findOne({ correo, preguntaSecreta });

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado o pregunta secreta incorrecta' });
    }

    const isAnswerValid = await bcrypt.compare(respuestaSecreta, usuario.respuestaSecreta);

    if (!isAnswerValid) {
      return res.status(401).json({ error: 'Respuesta secreta incorrecta' });
    }

    res.json({ message: 'Respuesta secreta correcta. Aquí se debe implementar la lógica de recuperación.' });
  } catch (error) {
    console.error('Error al recuperar contraseña:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/usuarios/cambiarPassword', async (req, res) => {
  const { correo, nuevaPassword } = req.body;

  try {
    const db = client.db();
    const hashedPassword = await bcrypt.hash(nuevaPassword, 10);
    
    const result = await db.collection('Usuarios').updateOne(
      { correo },
      { $set: { password: hashedPassword } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ message: 'Contraseña cambiada exitosamente' });
  } catch (error) {
    console.error('Error al cambiar la contraseña:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/usuarios/:nombre/perfil', async (req, res) => {
  const { nombre } = req.params;

  try {
    const db = client.db();
    const usuario = await db.collection('Usuarios').findOne({ nombre });

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(usuario);
  } catch (error) {
    console.error('Error al obtener el perfil del usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/usuarios/updateProfile', async (req, res) => {
  const { nombre, calle, numero, colonia, estado, phone } = req.body;

  try {
    const db = client.db();
    const updateData = {
      calle,
      numero,
      colonia,
      estado,
      phone
    };

    const result = await db.collection('Usuarios').updateOne(
      { nombre },
      { $set: updateData }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const updatedUser = await db.collection('Usuarios').findOne({ nombre });
    res.json(updatedUser);
  } catch (error) {
    console.error('Error al actualizar el perfil del usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/usuarios', async (req, res) => {
  try {
    const db = client.db();
    const usuarios = await db.collection('Usuarios').find().toArray();
    res.json(usuarios);
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.put('/api/usuarios/:id', async (req, res) => {
  const userId = req.params.id;
  const { _id, ...updatedUser } = req.body;

  try {
    const db = client.db();
    const result = await db.collection('Usuarios').updateOne(
      { _id: new ObjectId(userId) },
      { $set: updatedUser }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ message: 'Usuario actualizado exitosamente' });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.put('/api/usuarios/:id/removeAdmin', async (req, res) => {
  const userId = req.params.id;

  try {
    const db = client.db();
    const result = await db.collection('Usuarios').updateOne(
      { _id: new ObjectId(userId) },
      { $set: { isAdmin: false } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ message: 'Rol de administrador removido exitosamente' });
  } catch (error) {
    console.error('Error al remover rol de administrador:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.delete('/api/usuarios/:id', async (req, res) => {
  const userId = req.params.id;

  try {
    const db = client.db();
    const objectId = new ObjectId(userId);
    const result = await db.collection('Usuarios').deleteOne({ _id: objectId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ message: 'Usuario eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.put('/api/usuarios/:id/makeAdmin', async (req, res) => {
  const userId = req.params.id;

  try {
    const db = client.db();
    const result = await db.collection('Usuarios').updateOne(
      { _id: new ObjectId(userId) },
      { $set: { isAdmin: true } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ message: 'Rol de administrador asignado exitosamente' });
  } catch (error) {
    console.error('Error al asignar rol de administrador:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/terminos-condiciones', async (req, res) => {
  try {
    const db = client.db();
    const terminosCondiciones = await db.collection('Informacion').findOne({ Titulo: "Terminos Y condiciones" });
    if (!terminosCondiciones) {
      return res.status(404).json({ error: 'Información no encontrada' });
    }
    res.json(terminosCondiciones);
  } catch (error) {
    console.error('Error al obtener Términos y Condiciones:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.put('/api/terminos-condiciones', async (req, res) => {
  const { Contenido } = req.body;

  try {
    const db = client.db();
    const result = await db.collection('Informacion').updateOne(
      { Titulo: "Terminos Y condiciones" },
      { $set: { Contenido } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Términos y Condiciones no encontrados' });
    }

    res.json({ message: 'Términos y Condiciones actualizados exitosamente' });
  } catch (error) {
    console.error('Error al actualizar Términos y Condiciones:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/quienes-somos', async (req, res) => {
  try {
    const db = client.db();
    const quienesSomos = await db.collection('Informacion').findOne({ Titulo: "Quienes Somos" });
    if (!quienesSomos) {
      return res.status(404).json({ error: 'Información no encontrada' });
    }
    res.json(quienesSomos);
  } catch (error) {
    console.error('Error al obtener Quienes Somos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.put('/api/quienes-somos', async (req, res) => {
  const { Contenido } = req.body;

  try {
    const db = client.db();
    const result = await db.collection('Informacion').updateOne(
      { Titulo: "Quienes Somos" },
      { $set: { Contenido } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Información no encontrada' });
    }

    res.json({ message: 'Información actualizada exitosamente' });
  } catch (error) {
    console.error('Error al actualizar la información:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/politicas', async (req, res) => {
  try {
    const db = client.db();
    const politicas = await db.collection('Informacion').findOne({ Titulo: "Politicas" });
    if (!politicas) {
      return res.status(404).json({ error: 'Información no encontrada' });
    }
    res.json(politicas);
  } catch (error) {
    console.error('Error al obtener Políticas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.put('/api/politicas', async (req, res) => {
  const { Contenido } = req.body;

  try {
    const db = client.db();
    const result = await db.collection('Informacion').updateOne(
      { Titulo: "Politicas" },
      { $set: { Contenido } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Políticas no encontradas' });
    }

    res.json({ message: 'Políticas actualizadas exitosamente' });
  } catch (error) {
    console.error('Error al actualizar Políticas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/vision-mision', async (req, res) => {
  try {
    const db = client.db();
    const visionMision = await db.collection('Informacion').findOne({ titulo: "Vision-mision" });
    if (!visionMision) {
      return res.status(404).json({ error: 'Información no encontrada' });
    }
    res.json(visionMision);
  } catch (error) {
    console.error('Error al obtener Visión y Misión:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.put('/api/admin/vision-mision', async (req, res) => {
  const { Contenido } = req.body;

  try {
    const db = client.db();
    const result = await db.collection('Informacion').updateOne(
      { titulo: "Vision-mision" },
      { $set: { Contenido } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Información no encontrada' });
    }

    res.json({ message: 'Información actualizada exitosamente' });
  } catch (error) {
    console.error('Error al actualizar la información:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/metodos-pago', async (req, res) => {
  try {
    const db = client.db();
    const metodosPago = await db.collection('Informacion').findOne({ Titulo: "Metodos de Pago" });
    if (!metodosPago) {
      return res.status(404).json({ error: 'Información no encontrada' });
    }
    res.json(metodosPago);
  } catch (error) {
    console.error('Error al obtener Métodos de Pago:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/contacto', async (req, res) => {
  try {
    const db = client.db();
    const contacto = await db.collection('Informacion').findOne({ Titulo: "Contacto" });
    if (!contacto) {
      return res.status(404).json({ error: 'Información no encontrada' });
    }
    res.json(contacto);
  } catch (error) {
    console.error('Error al obtener Contacto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/adminConfig', async (req, res) => {
  try {
    const db = client.db();
    const config = await db.collection('Informacion').find().toArray();
    if (!config) {
      return res.status(404).json({ error: 'Configuración no encontrada' });
    }
    res.json(config);
  } catch (error) {
    console.error('Error al obtener configuración:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/adminConfig', async (req, res) => {
  const newConfig = req.body;

  try {
    const db = client.db();
    const updates = await Promise.all(newConfig.map(async item => {
      const result = await db.collection('Informacion').updateOne(
        { Titulo: item.Titulo },
        { $set: { Contenido: item.Contenido } }
      );
      return result;
    }));

    res.json({ message: 'Configuración actualizada exitosamente', updates });
  } catch (error) {
    console.error('Error al actualizar configuración:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

conectar().then(() => {
  app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
  });
});

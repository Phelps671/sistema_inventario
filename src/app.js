import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import session from 'express-session'; // Importando o middleware de sessão

dotenv.config({ path: './variaveis.env' });

// Resolve o __filename e __dirname para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware para analisar JSON e dados de formulários
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurar middleware de sessão
app.use(session({
  secret: 'seuSegredo', // substitua por uma senha forte
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // definir como true se estiver usando HTTPS
}));

// autenticação
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  } else {
    res.redirect('/');
  }
}

// Inicialização do banco de dados
async function initializeDatabase() {
  try {
    console.log("Database User:", process.env.DB_USER);
    console.log("Database Password:", process.env.DB_PASSWORD);
    console.log("Database Host:", process.env.DB_HOST);
    console.log("Database Port:", process.env.DB_PORT);
    console.log("Database Name:", process.env.DB_NAME);

    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      authPlugins: {
        mysql_native_password: () => async () => {
          return Buffer.from(process.env.DB_PASSWORD);
        }
      }
    });
    console.log("Connected to MySQL database");
    return connection;
  } catch (error) {
    console.error("Failed to connect to MySQL database:", error);
    throw error;
  }
}

let connection;

// Configurar rotas e iniciar o servidor
initializeDatabase().then(conn => {
  connection = conn;

  app.use(express.static(path.join(__dirname, 'public')));

  // Rota principal
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  /* --------------Home------------------*/

  // Rota de login
  app.post('/login', async (req, res) => {
    try {
      const { nome_usuario, senha } = req.body;

      if (!nome_usuario || !senha) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
      }

      const [rows] = await connection.execute('SELECT * FROM usuario WHERE nome_usuario = ?', [nome_usuario]);

      if (rows.length === 0) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      const user = rows[0];

      if (senha !== user.senha) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      req.session.user = { nome: user.nome_usuario, email: user.email }; // Armazenar o usuário na sessão
      res.redirect('/Relatorio');
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro no servidor' });
    }
  });

    // Rotas protegidas
    app.get('/Relatorio', isAuthenticated, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'Relatorio.html'));
    });
  
    app.get('/Usuarios', isAuthenticated, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'Usuarios.html'));
    });
  
    app.get('/Produtos', isAuthenticated, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'Produtos.html'));
    });
  
    app.get('/Laboratorio', isAuthenticated, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'Laboratorio.html'));
    });

  /* --------------usuario------------------*/

  // Rota para obter o usuário logado
  app.get('/api/usuario-logado', (req, res) => {
    if (req.session.user) {
      res.json(req.session.user);
    } else {
      res.status(401).json({ error: 'Usuário não logado' });
    }
  });

  // Rotas para logout
  app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao fazer logout' });
      }
      res.redirect('/');
    });
  });

  // Rotas para usuários
  app.get('/api/usuarios', isAuthenticated, async (req, res) => {
    try {
      const [usuarios] = await connection.execute('SELECT nome_usuario, email FROM usuario');
      res.json(usuarios);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro no servidor' });
    }
  });

  app.post('/api/usuarios', isAuthenticated, async (req, res) => {
    const { nome_usuario, email, senha } = req.body;

    if (!nome_usuario || !email || !senha) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    try {
      await connection.execute(
        'INSERT INTO usuario (nome_usuario, email, senha) VALUES (?, ?, ?)',
        [nome_usuario, email, senha]
      );
      res.status(201).json({ message: 'Usuário adicionado com sucesso' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro no servidor' });
    }
  });

  app.delete('/api/usuarios/:email', isAuthenticated, async (req, res) => {
    const { email } = req.params;

    try {
      await connection.execute(
        'DELETE FROM usuario WHERE email = ?',
        [email]
      );
      res.status(200).json({ message: 'Usuário removido com sucesso' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro no servidor' });
    }
  });

  /* --------------produtos------------------*/

  // Rotas para produtos
  app.get('/api/produto', isAuthenticated, async (req, res) => {
    try {
      const [produtos] = await connection.execute('SELECT * FROM produto');
      res.json(produtos);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro no servidor' });
    }
  });

  app.post('/api/produto', isAuthenticated, async (req, res) => {
    const { nome_produto, unidade_produto, descricao_produto, NCM } = req.body;

    if (!nome_produto || !unidade_produto || !descricao_produto || !NCM) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    try {
      const [result] = await connection.execute(
        'INSERT INTO produto (nome_produto, unidade_produto, descricao_produto, NCM) VALUES (?, ?, ?, ?)',
        [nome_produto, unidade_produto, descricao_produto, NCM]
      );
      res.status(201).json({ message: 'Produto adicionado com sucesso', id_produto: result.insertId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro no servidor' });
    }
  });

  app.delete('/api/produto/:id_produto', isAuthenticated, async (req, res) => {
    const { id_produto } = req.params;

    try {
      const [result] = await connection.execute('DELETE FROM produto WHERE id_produto = ?', [id_produto]);

      if (result.affectedRows > 0) {
        res.status(200).json({ message: 'Produto removido com sucesso' });
      } else {
        res.status(404).json({ error: 'Produto não encontrado' });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro no servidor' });
    }
  });

  /* --------------laboratórios------------------*/

  // Rotas para laboratórios
  app.get('/api/laboratorios', isAuthenticated, async (req, res) => {
    try {
      const [laboratorios] = await connection.execute(`
        SELECT laboratorio.id_laboratorio, laboratorio.nome_laboratorio, usuario.nome_usuario AS responsavel, usuario.email
        FROM laboratorio
        LEFT JOIN usuario ON laboratorio.usuario_email = usuario.email
      `);
      res.json(laboratorios);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro no servidor' });
    }
  });
  
  

  app.post('/api/laboratorios', async (req, res) => {
    try {
      const { nome_laboratorio, usuario_email } = req.body;

      if (!nome_laboratorio || !usuario_email) {
        return res.status(400).json({ error: 'Nome do laboratório e email do usuário são obrigatórios.' });
      }

      const [result] = await connection.execute(
        'INSERT INTO laboratorio (nome_laboratorio, usuario_email) VALUES (?, ?)',
        [nome_laboratorio, usuario_email]
      );
      
      res.status(201).json({ message: 'Laboratório adicionado com sucesso!', id_laboratorio: result.insertId });
    } catch (error) {
      console.error('Erro ao adicionar laboratório:', error);
      res.status(500).json({ error: 'Erro ao adicionar laboratório' });
    }
  });

  app.delete('/api/laboratorios/:id_laboratorio', async (req, res) => {
    try {
        const { id_laboratorio } = req.params;
        console.log('ID do Laboratório recebido:', id_laboratorio); // Verifique o valor aqui
        await connection.execute('DELETE FROM laboratorio WHERE id_laboratorio = ?', [id_laboratorio]);
        res.json({ message: 'Laboratório removido com sucesso!' });
    } catch (error) {
        console.error('Erro ao remover laboratório:', error);
        res.status(500).json({ error: 'Erro ao remover laboratório' });
    }
});



  /* --------------servidor------------------*/

  // Iniciar o servidor
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Servidor rodando no endereço http://localhost:${PORT}`);
  });
}).catch(error => {
  console.error("Initialization failed:", error);
});

export default app;

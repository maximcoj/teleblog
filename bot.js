const { Telegraf } = require('telegraf');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Файловое хранилище для данных
const DATA_DIR = path.join(__dirname, 'data');
const BLOGS_FILE = path.join(DATA_DIR, 'blogs.json');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');

// Создаем директорию для данных, если её нет
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Функции для работы с файловым хранилищем
function loadData(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Ошибка загрузки данных из ${filePath}:`, error);
  }
  return [];
}

function saveData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(`Ошибка сохранения данных в ${filePath}:`, error);
  }
}

// Загружаем существующие данные
let blogs = loadData(BLOGS_FILE);
let posts = loadData(POSTS_FILE);

// Генерируем уникальные ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Функция для получения URL изображения из Telegram
async function getImageUrl(fileId) {
  try {
    const file = await bot.telegram.getFile(fileId);
    return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
  } catch (error) {
    console.error('Ошибка получения URL изображения:', error);
    return null;
  }
}

// Подключение к MongoDB (если доступно)
let useMongoDB = false;
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/teleblog', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Подключение к MongoDB установлено');
  useMongoDB = true;
}).catch((error) => {
  console.log('⚠️ MongoDB недоступна, используется файловое хранилище');
  console.log('Для установки MongoDB: brew install mongodb-community');
});

// Модели данных (используются только если MongoDB доступна)
let Blog, Post;
if (useMongoDB) {
  Blog = require('./models/Blog');
  Post = require('./models/Post');
}

// Состояния пользователей
const userStates = new Map();

// Команда /start
bot.start((ctx) => {
  const welcomeMessage = `
🎉 Добро пожаловать в TeleBlog!

Я помогу вам создать персональный блог прямо из Telegram.

Доступные команды:
/create - Создать новый блог
/posts - Управление постами
/help - Помощь

Начните с команды /create для создания вашего блога!
  `;
  
  ctx.reply(welcomeMessage);
});

// Устанавливаем команды бота
bot.telegram.setMyCommands([
  { command: 'start', description: 'Запустить бота' },
  { command: 'create', description: 'Создать новый блог' },
  { command: 'posts', description: 'Управление постами' },
  { command: 'edit', description: 'Редактировать пост' },
  { command: 'delete', description: 'Удалить пост' },
  { command: 'deleteblog', description: 'Удалить блог' },
  { command: 'help', description: 'Помощь по командам' }
]);

// Команда создания блога
bot.command('create', async (ctx) => {
  const userId = ctx.from.id;
  
  // Проверяем, есть ли уже блог у пользователя
  let existingBlog;
  if (useMongoDB) {
    existingBlog = await Blog.findOne({ userId });
  } else {
    existingBlog = blogs.find(blog => blog.userId === userId);
  }
  
  if (existingBlog) {
    ctx.reply('У вас уже есть блог! Используйте /posts для управления постами.');
    return;
  }
  
  userStates.set(userId, { state: 'waiting_for_blog_name' });
  ctx.reply('Введите название для вашего блога:');
});

// Команда управления постами
bot.command('posts', async (ctx) => {
  const userId = ctx.from.id;
  
  let blog;
  if (useMongoDB) {
    blog = await Blog.findOne({ userId });
  } else {
    blog = blogs.find(b => b.userId === userId);
  }
  
  if (!blog) {
    ctx.reply('У вас еще нет блога. Используйте /create для создания блога.');
    return;
  }
  
  let userPosts;
  if (useMongoDB) {
    userPosts = await Post.find({ blogId: blog._id }).sort({ createdAt: -1 });
  } else {
    userPosts = posts.filter(p => p.blogId === blog.id && (p.isPublished === undefined || p.isPublished !== false)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  
  if (userPosts.length === 0) {
    ctx.reply('В вашем блоге пока нет постов. Отправьте сообщение, чтобы создать первый пост!');
    userStates.set(userId, { state: 'creating_post', blogId: blog.id || blog._id });
    return;
  }
  
  let message = '📝 Ваши посты:\n\n';
  userPosts.forEach((post, index) => {
    const date = new Date(post.createdAt).toLocaleDateString('ru-RU');
    message += `${index + 1}. ${post.title || 'Без названия'} (${date})\n`;
  });
  
  message += '\nОтправьте сообщение, чтобы создать новый пост, или используйте команды:\n';
  message += '/edit <номер> - Редактировать пост\n';
  message += '/delete <номер> - Удалить пост';
  
  ctx.reply(message);
  userStates.set(userId, { state: 'managing_posts', blogId: blog.id || blog._id, posts: userPosts });
});

// Команда редактирования поста
bot.command('edit', async (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(' ');
  
  if (args.length < 2) {
    ctx.reply('Использование: /edit <номер_поста>');
    return;
  }
  
  const postNumber = parseInt(args[1]) - 1;
  const userState = userStates.get(userId);
  
  if (!userState || !userState.posts || !userState.posts[postNumber]) {
    ctx.reply('Пост не найден. Используйте /posts для просмотра списка постов.');
    return;
  }
  
  const post = userState.posts[postNumber];
  userStates.set(userId, { 
    state: 'editing_post', 
    blogId: userState.blogId, 
    postId: post.id || post._id 
  });
  
  ctx.reply(`Редактирование поста "${post.title || 'Без названия'}". Отправьте новое содержимое:`);
});

// Команда удаления поста
bot.command('delete', async (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(' ');
  
  if (args.length < 2) {
    ctx.reply('Использование: /delete <номер_поста>');
    return;
  }
  
  const postNumber = parseInt(args[1]) - 1;
  const userState = userStates.get(userId);
  
  if (!userState || !userState.posts || !userState.posts[postNumber]) {
    ctx.reply('Пост не найден. Используйте /posts для просмотра списка постов.');
    return;
  }
  
  const post = userState.posts[postNumber];
  
  console.log(`Удаление поста: userId=${userId}, postNumber=${postNumber}, postId=${post.id || post._id}`);
  
  try {
    if (useMongoDB) {
      await Post.findByIdAndDelete(post._id);
    } else {
      // Удаляем пост из файлового хранилища
      const postIndex = posts.findIndex(p => p.id === post.id);
      if (postIndex !== -1) {
        posts.splice(postIndex, 1);
        saveData(POSTS_FILE, posts);
      }
    }
    
    ctx.reply('Пост успешно удален!');
    
    // Обновляем список постов
    if (useMongoDB) {
      const updatedPosts = await Post.find({ blogId: userState.blogId }).sort({ createdAt: -1 });
      userStates.set(userId, { 
        state: 'managing_posts', 
        blogId: userState.blogId, 
        posts: updatedPosts 
      });
    } else {
      const updatedPosts = posts.filter(p => p.blogId === userState.blogId && (p.isPublished === undefined || p.isPublished !== false)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      userStates.set(userId, { 
        state: 'managing_posts', 
        blogId: userState.blogId, 
        posts: updatedPosts 
      });
    }
  } catch (error) {
    console.error('Ошибка при удалении поста:', error);
    ctx.reply('Ошибка при удалении поста. Попробуйте еще раз.');
  }
});

// Команда удаления блога
bot.command('deleteblog', async (ctx) => {
  const userId = ctx.from.id;
  
  // Проверяем, есть ли блог у пользователя
  let blog;
  if (useMongoDB) {
    blog = await Blog.findOne({ userId });
  } else {
    blog = blogs.find(b => b.userId === userId);
  }
  
  if (!blog) {
    ctx.reply('У вас нет блога для удаления. Используйте /create для создания блога.');
    return;
  }
  
  // Создаем кнопки подтверждения
  const keyboard = {
    inline_keyboard: [
      [
        { text: '❌ Нет, отменить', callback_data: 'deleteblog_cancel' },
        { text: '✅ Да, удалить блог', callback_data: 'deleteblog_confirm' }
      ]
    ]
  };
  
  ctx.reply(
    `⚠️ ВНИМАНИЕ! Вы собираетесь удалить блог "${blog.name}"\n\n` +
    `Это действие:\n` +
    `• Удалит ВСЕ посты в блоге\n` +
    `• Удалит сам блог\n` +
    `• Это действие НЕОБРАТИМО\n\n` +
    `Вы уверены, что хотите удалить свой блог?`,
    { reply_markup: keyboard }
  );
  
  // Сохраняем информацию о блоге для подтверждения
  userStates.set(userId, { 
    state: 'confirming_blog_deletion', 
    blogId: blog.id || blog._id,
    blogName: blog.name
  });
});

// Команда помощи
bot.command('help', (ctx) => {
  const helpMessage = `
📚 Помощь по командам:

/create - Создать новый блог
/posts - Управление постами
/edit <номер> - Редактировать пост
/delete <номер> - Удалить пост
/deleteblog - Удалить блог
/help - Показать эту справку

💡 Просто отправьте сообщение, чтобы создать новый пост!
  `;
  
  ctx.reply(helpMessage);
});

// Обработчик callback-кнопок
bot.action(/deleteblog_(confirm|cancel)/, async (ctx) => {
  const userId = ctx.from.id;
  const action = ctx.match[1]; // 'confirm' или 'cancel'
  const userState = userStates.get(userId);
  
  if (!userState || userState.state !== 'confirming_blog_deletion') {
    ctx.answerCbQuery('Действие недоступно');
    return;
  }
  
  if (action === 'cancel') {
    // Отменяем удаление
    userStates.delete(userId);
    ctx.editMessageText('❌ Удаление блога отменено.');
    ctx.answerCbQuery();
  } else if (action === 'confirm') {
    // Подтверждаем удаление
    try {
      const { blogId, blogName } = userState;
      
      console.log(`Удаление блога: userId=${userId}, blogId=${blogId}, blogName=${blogName}`);
      
      if (useMongoDB) {
        // Удаляем все посты блога
        await Post.deleteMany({ blogId });
        // Удаляем сам блог
        await Blog.findByIdAndDelete(blogId);
      } else {
        // Удаляем все посты блога из файлового хранилища
        const postsToKeep = posts.filter(p => p.blogId !== blogId);
        posts = postsToKeep;
        saveData(POSTS_FILE, posts);
        
        // Удаляем блог из файлового хранилища
        const blogsToKeep = blogs.filter(b => b.id !== blogId);
        blogs = blogsToKeep;
        saveData(BLOGS_FILE, blogs);
      }
      
      // Очищаем состояние пользователя
      userStates.delete(userId);
      
      ctx.editMessageText(`🗑️ Блог "${blogName}" успешно удален вместе со всеми постами.\n\nТеперь вы можете создать новый блог командой /create`);
      ctx.answerCbQuery();
      
    } catch (error) {
      console.error('Ошибка при удалении блога:', error);
      ctx.editMessageText('❌ Произошла ошибка при удалении блога. Попробуйте еще раз.');
      ctx.answerCbQuery();
    }
  }
});

// Обработка текстовых сообщений и изображений
bot.on(['text', 'photo'], async (ctx) => {
  const userId = ctx.from.id;
  const userState = userStates.get(userId);
  let messageText = '';
  let imageFileId = null;
  
  // Обрабатываем текст и изображения
  if (ctx.message.text) {
    messageText = ctx.message.text;
  } else if (ctx.message.photo && ctx.message.photo.length > 0) {
    // Берем самое большое изображение
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    imageFileId = photo.file_id;
    messageText = ctx.message.caption || '';
  } else {
    // Если нет ни текста, ни изображения, игнорируем сообщение
    return;
  }
  
  if (!userState) {
    ctx.reply('Используйте /create для создания блога или /posts для управления постами.');
    return;
  }
  
  switch (userState.state) {
    case 'waiting_for_blog_name':
      try {
        const blogName = messageText.trim();
        const subdomain = blogName.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Проверяем уникальность поддомена
        let existingBlog;
        if (useMongoDB) {
          existingBlog = await Blog.findOne({ subdomain });
        } else {
          existingBlog = blogs.find(blog => blog.subdomain === subdomain);
        }
        
        if (existingBlog) {
          ctx.reply('Блог с таким названием уже существует. Попробуйте другое название:');
          return;
        }
        
        // Сохраняем название блога и запрашиваем описание
        userStates.set(userId, { 
          state: 'waiting_for_blog_description', 
          blogName, 
          subdomain 
        });
        ctx.reply('Отлично! Теперь введите описание для вашего блога (или отправьте "-" чтобы пропустить):');
      } catch (error) {
        ctx.reply('Ошибка при создании блога. Попробуйте еще раз.');
      }
      break;
      
    case 'waiting_for_blog_description':
      try {
        const description = messageText.trim() === '-' ? '' : messageText.trim();
        const { blogName, subdomain } = userState;
        
        const blogData = {
          id: generateId(),
          userId,
          name: blogName,
          subdomain,
          description,
          url: `https://${subdomain}.yourdomain.com`,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        if (useMongoDB) {
          const blog = new Blog(blogData);
          await blog.save();
          userStates.delete(userId);
          ctx.reply(`🎉 Блог "${blogName}" успешно создан!\n\nВаш блог доступен по адресу: ${blog.url}\n\nТеперь отправляйте сообщения, чтобы создавать посты!`);
          userStates.set(userId, { state: 'creating_post', blogId: blog._id });
        } else {
          blogs.push(blogData);
          saveData(BLOGS_FILE, blogs);
          userStates.delete(userId);
          ctx.reply(`🎉 Блог "${blogName}" успешно создан!\n\nВаш блог доступен по адресу: ${blogData.url}\n\nТеперь отправляйте сообщения, чтобы создавать посты!`);
          userStates.set(userId, { state: 'creating_post', blogId: blogData.id });
        }
      } catch (error) {
        ctx.reply('Ошибка при создании блога. Попробуйте еще раз.');
      }
      break;
      
    case 'creating_post':
      try {
        console.log(`Создание поста для пользователя ${userId}, blogId: ${userState.blogId}`);
        
        let blog;
        if (useMongoDB) {
          blog = await Blog.findById(userState.blogId);
        } else {
          blog = blogs.find(b => b.id === userState.blogId || b._id === userState.blogId);
        }
        
        if (!blog) {
          console.log(`Блог не найден для blogId: ${userState.blogId}`);
          ctx.reply('Блог не найден. Используйте /create для создания нового блога.');
          userStates.delete(userId);
          return;
        }
        
        console.log(`Блог найден: ${blog.name}, создание поста...`);
        
        // Создаем заголовок из первого параграфа (максимум 60 символов)
        let title = '';
        if (messageText) {
          const firstParagraph = messageText.split('\n')[0].trim();
          title = firstParagraph.length > 60 ? firstParagraph.substring(0, 60) + '...' : firstParagraph;
        }
        
        const postData = {
          id: generateId(),
          blogId: userState.blogId,
          content: messageText,
          title: title || 'Без названия',
          imageFileId: imageFileId,
          createdAt: new Date(),
          updatedAt: new Date(),
          isPublished: true
        };
        
        if (useMongoDB) {
          const post = new Post(postData);
          await post.save();
        } else {
          posts.push(postData);
          saveData(POSTS_FILE, posts);
        }
        
        const successMessage = imageFileId 
          ? '✅ Пост с изображением успешно создан и опубликован в вашем блоге!'
          : '✅ Пост успешно создан и опубликован в вашем блоге!';
        
        ctx.reply(successMessage);
      } catch (error) {
        ctx.reply('Ошибка при создании поста. Попробуйте еще раз.');
      }
      break;
      
    case 'editing_post':
      try {
        // Создаем заголовок из первого параграфа (максимум 60 символов)
        let title = '';
        if (messageText) {
          const firstParagraph = messageText.split('\n')[0].trim();
          title = firstParagraph.length > 60 ? firstParagraph.substring(0, 60) + '...' : firstParagraph;
        }
        
        if (useMongoDB) {
          await Post.findByIdAndUpdate(userState.postId, {
            content: messageText,
            title: title || 'Без названия',
            imageFileId: imageFileId,
            updatedAt: new Date()
          });
          
          userStates.set(userId, { 
            state: 'managing_posts', 
            blogId: userState.blogId,
            posts: await Post.find({ blogId: userState.blogId }).sort({ createdAt: -1 })
          });
        } else {
          const postIndex = posts.findIndex(p => p.id === userState.postId);
          if (postIndex !== -1) {
            posts[postIndex].content = messageText;
            posts[postIndex].title = title || 'Без названия';
            posts[postIndex].imageFileId = imageFileId;
            posts[postIndex].updatedAt = new Date();
            saveData(POSTS_FILE, posts);
            
            const updatedPosts = posts.filter(p => p.blogId === userState.blogId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            userStates.set(userId, { 
              state: 'managing_posts', 
              blogId: userState.blogId,
              posts: updatedPosts
            });
          }
        }
        
        const successMessage = imageFileId 
          ? '✅ Пост с изображением успешно обновлен!'
          : '✅ Пост успешно обновлен!';
        
        ctx.reply(successMessage);
      } catch (error) {
        ctx.reply('Ошибка при обновлении поста. Попробуйте еще раз.');
      }
      break;
      
    case 'managing_posts':
      // Создаем новый пост
      try {
        let blog;
        if (useMongoDB) {
          blog = await Blog.findById(userState.blogId);
        } else {
          blog = blogs.find(b => b.id === userState.blogId || b._id === userState.blogId);
        }
        
        if (!blog) {
          ctx.reply('Блог не найден. Используйте /create для создания нового блога.');
          userStates.delete(userId);
          return;
        }
        
        // Создаем заголовок из первого параграфа (максимум 60 символов)
        let title = '';
        if (messageText) {
          const firstParagraph = messageText.split('\n')[0].trim();
          title = firstParagraph.length > 60 ? firstParagraph.substring(0, 60) + '...' : firstParagraph;
        }
        
        const postData = {
          id: generateId(),
          blogId: userState.blogId,
          content: messageText,
          title: title || 'Без названия',
          imageFileId: imageFileId,
          createdAt: new Date(),
          updatedAt: new Date(),
          isPublished: true
        };
        
        if (useMongoDB) {
          const post = new Post(postData);
          await post.save();
          
          // Обновляем список постов
          const updatedPosts = await Post.find({ blogId: userState.blogId }).sort({ createdAt: -1 });
          userStates.set(userId, { 
            state: 'managing_posts', 
            blogId: userState.blogId, 
            posts: updatedPosts 
          });
        } else {
          posts.push(postData);
          saveData(POSTS_FILE, posts);
          
          // Обновляем список постов
          const updatedPosts = posts.filter(p => p.blogId === userState.blogId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          userStates.set(userId, { 
            state: 'managing_posts', 
            blogId: userState.blogId, 
            posts: updatedPosts 
          });
        }
        
        const successMessage = imageFileId 
          ? '✅ Пост с изображением успешно создан и опубликован в вашем блоге!'
          : '✅ Пост успешно создан и опубликован в вашем блоге!';
        
        ctx.reply(successMessage);
      } catch (error) {
        ctx.reply('Ошибка при создании поста. Попробуйте еще раз.');
      }
      break;
  }
});

// Корневой маршрут
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Самый простой способ создать свой блог</title>
      <link rel="stylesheet" href="/css/style.css">
      <link rel="icon" href="/assets/teleblog.svg" type="image/svg+xml">
      <meta name="description" content="Создайте свой блог за 2 минуты через Telegram-бота Teleblog!">
    </head>
    <body>
      <main class="landing-main">
        <div class="landing-logo">
          <img src="/assets/teleblog.svg" alt="Teleblog logo" width="64" height="64"/>
        </div>
        <h1 class="landing-title">Самый простой способ<br>создать свой блог</h1>
        <div class="landing-steps">
          <div class="landing-step">
            <span class="landing-step-number">1</span>
            <span>Активируйте бот <a class="landing-step-link" href="https://t.me/teleblogsmart_bot" target="_blank">@teleblogsmart_bot</a></span>
          </div>
          <div class="landing-step">
            <span class="landing-step-number">2</span>
            <span>Следуйте инструкциям из 2-х шагов</span>
          </div>
          <div class="landing-step">
            <span class="landing-step-number">3</span>
            <span>Отправляйте сообщения для создания постов</span>
          </div>
        </div>
        <a class="landing-btn" href="https://t.me/teleblogsmart_bot" target="_blank">
          Создать Teleblog
          <span class="landing-btn-icon">
            <img src="/assets/telegram-white.svg" alt="Telegram" width="24" height="24"/>
          </span>
        </a>
        <div class="landing-stats">
          <div>Всего блога: ${blogs.length}</div>
          <div>Всего постов: ${posts.length}</div>
        </div>
        <footer class="landing-footer">
          Это вайбкод-эксперимент создан <a href="https://t.me/cojocarumaxim" target="_blank" style="color:inherit;text-decoration:underline;">@cojocarumaxim</a> для простого ведения блога
        </footer>
      </main>
    </body>
    </html>
  `);
});

// API маршруты для веб-интерфейса
app.get('/api/blogs/:subdomain', async (req, res) => {
  try {
    let blog;
    let userPosts;
    
    if (useMongoDB) {
      blog = await Blog.findOne({ subdomain: req.params.subdomain });
      if (blog) {
        userPosts = await Post.find({ blogId: blog._id }).sort({ createdAt: -1 });
      }
    } else {
      blog = blogs.find(b => b.subdomain === req.params.subdomain);
      if (blog) {
        userPosts = posts.filter(p => p.blogId === blog.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
    }
    
    if (!blog) {
      return res.status(404).json({ error: 'Блог не найден' });
    }
    
    res.json({ blog, posts: userPosts });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/blogs/:subdomain/posts/:postId', async (req, res) => {
  try {
    let blog;
    let post;
    
    if (useMongoDB) {
      blog = await Blog.findOne({ subdomain: req.params.subdomain });
      if (blog) {
        post = await Post.findOne({ _id: req.params.postId, blogId: blog._id });
      }
    } else {
      blog = blogs.find(b => b.subdomain === req.params.subdomain);
      if (blog) {
        post = posts.find(p => p.id === req.params.postId && p.blogId === blog.id);
      }
    }
    
    if (!blog) {
      return res.status(404).json({ error: 'Блог не найден' });
    }
    
    if (!post) {
      return res.status(404).json({ error: 'Пост не найден' });
    }
    
    res.json({ post });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// API для отслеживания просмотров блога
app.post('/api/blogs/:subdomain/view', async (req, res) => {
  try {
    let blog;
    if (useMongoDB) {
      blog = await Blog.findOne({ subdomain: req.params.subdomain });
      if (blog) {
        await Post.updateMany(
          { blogId: blog._id },
          { $inc: { viewCount: 1 } }
        );
      }
    } else {
      blog = blogs.find(b => b.subdomain === req.params.subdomain);
      if (blog) {
        // Обновляем просмотры в файловом хранилище
        posts.forEach(post => {
          if (post.blogId === blog.id) {
            post.viewCount = (post.viewCount || 0) + 1;
          }
        });
        saveData(POSTS_FILE, posts);
      }
    }
    
    if (!blog) {
      return res.status(404).json({ error: 'Блог не найден' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка при обновлении просмотров:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// API для лайков постов
app.post('/api/blogs/:subdomain/posts/:postId/like', async (req, res) => {
  try {
    let blog;
    let post;
    
    if (useMongoDB) {
      blog = await Blog.findOne({ subdomain: req.params.subdomain });
      if (blog) {
        post = await Post.findOne({ _id: req.params.postId, blogId: blog._id });
      }
    } else {
      blog = blogs.find(b => b.subdomain === req.params.subdomain);
      if (blog) {
        post = posts.find(p => p.id === req.params.postId && p.blogId === blog.id);
      }
    }
    
    if (!blog) {
      return res.status(404).json({ error: 'Блог не найден' });
    }
    
    if (!post) {
      return res.status(404).json({ error: 'Пост не найден' });
    }
    
    // Увеличиваем счетчик лайков
    if (useMongoDB) {
      post.likes = (post.likes || 0) + 1;
      await post.save();
    } else {
      post.likes = (post.likes || 0) + 1;
      saveData(POSTS_FILE, posts);
    }
    
    res.json({ success: true, likes: post.likes });
  } catch (error) {
    console.error('Ошибка при обновлении лайков:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Маршрут для отдельного поста
app.get('/:subdomain/post/:postId', async (req, res) => {
  try {
    let blog;
    let post;
    if (useMongoDB) {
      blog = await Blog.findOne({ subdomain: req.params.subdomain });
      if (blog) {
        post = await Post.findOne({ _id: req.params.postId, blogId: blog._id });
      }
    } else {
      blog = blogs.find(b => b.subdomain === req.params.subdomain);
      if (blog) {
        post = posts.find(p => p.id === req.params.postId && p.blogId === blog.id);
      }
    }
    if (!blog || !post) {
      return res.status(404).send('<h2>Пост не найден</h2>');
    }
    // Формируем imageUrl для отдельного поста
    if (post.imageFileId) {
      post.imageUrl = await getImageUrl(post.imageFileId);
      console.log('imageFileId:', post.imageFileId, 'imageUrl:', post.imageUrl);
    }
    res.send(`
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${post.title} — ${blog.name}</title>
        <meta name="description" content="${blog.description || ''}">
        <link rel="stylesheet" href="/css/style.css">
        <link rel="icon" href="/assets/teleblog.svg" type="image/svg+xml">
      </head>
      <body>
        <main class="blog-main">
          
          <header class="blog-header">
            <h1 class="blog-title">${blog.name}</h1>
            ${blog.description ? `<div class="blog-desc">${blog.description}</div>` : ''}
            <div class="blog-author">Автор <a href="https://t.me/cojocarumaxim" target="_blank">@cojocarumaxim</a></div>
          </header>
          <a class="blog-back-btn" href="/${blog.subdomain}">← Вернуться в блог</a>
          <article class="post">
            <h2 class="post-title">${post.title}</h2>
            ${post.imageUrl ? `<div class="post-image"><img src="${post.imageUrl}" alt="Изображение поста"></div>` : ''}
            <div class="post-content">${post.content.replace(/\n/g, '<br>')}</div>
            <div class="post-date">${new Date(post.createdAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </article>
        </main>
        <a class="blog-fab" href="/">
          <img src="/assets/teleblog.svg" alt="Teleblog logo" width="34" height="34"/>
        </a>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Ошибка при отображении блога:', error);
    res.status(500).send('<h2>Ошибка сервера</h2>');
  }
});

// Маршрут для отображения блога
app.get('/:subdomain', async (req, res) => {
  try {
    let blog;
    let userPosts;
    
    if (useMongoDB) {
      blog = await Blog.findOne({ subdomain: req.params.subdomain });
      if (blog) {
        userPosts = await Post.find({ blogId: blog._id, isPublished: true }).sort({ createdAt: -1 });
      }
    } else {
      blog = blogs.find(b => b.subdomain === req.params.subdomain);
      if (blog) {
        userPosts = posts.filter(p => p.blogId === blog.id && (p.isPublished === undefined || p.isPublished !== false)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
    }
    
    // Получаем URL изображений для постов
    if (userPosts && userPosts.length > 0) {
      for (let post of userPosts) {
        if (post.imageFileId) {
          post.imageUrl = await getImageUrl(post.imageFileId);
        }
      }
    }
    
    if (!blog) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Блог не найден</title>
          <link rel="stylesheet" href="/css/style.css">
        </head>
        <body>
          <div class="container">
            <div class="empty-state">
              <div class="empty-state-icon">🔍</div>
              <div class="empty-state-title">Блог не найден</div>
              <div class="empty-state-text">Запрашиваемый блог не существует или был удален.</div>
            </div>
          </div>
        </body>
        </html>
      `);
    }
    
    res.send(`
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${blog.name}</title>
        <meta name="description" content="${blog.description || 'Персональный блог'}">
        <link rel="stylesheet" href="/css/style.css">
        <link rel="icon" href="/assets/teleblog.svg" type="image/svg+xml">
      </head>
      <body>
        <main class="blog-main">
          <header class="blog-header">
            <h1 class="blog-title">${blog.name}</h1>
            ${blog.description ? `<div class="blog-desc">${blog.description}</div>` : ''}
            <div class="blog-author">Автор <a href="https://t.me/cojocarumaxim" target="_blank">@cojocarumaxim</a></div>
          </header>
          ${userPosts.length === 0 ? `
            <div class="post"><div class="post-content" style="color:#888">Пока нет постов</div></div>
          ` : userPosts.map(post => `
            <article class="post">
              <h2 class="post-title"><a href="/${blog.subdomain}/post/${post.id}" class="post-link">${post.title}</a></h2>
              ${post.imageUrl ? `<div class="post-image"><img src="${post.imageUrl}" alt="Изображение поста"></div>` : ''}
              <div class="post-content">${post.content.replace(/\n/g, '<br>')}</div>
              <div class="post-date">${new Date(post.createdAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </article>
          `).join('')}
        </main>
        <a class="blog-fab" href="/">
          <img src="/assets/teleblog.svg" alt="Teleblog logo" width="34" height="34"/>
        </a>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Ошибка при отображении блога:', error);
    res.status(500).send('<h2>Ошибка сервера</h2>');
  }
});
// Запуск бота и сервера
const PORT = process.env.PORT || 3000;
bot.launch().then(() => {
  console.log('🤖 Telegram бот запущен');
});
app.listen(PORT, () => {
  console.log(`🌐 Веб-сервер запущен на порту ${PORT}`);
});
// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
const { Telegraf } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Простое хранилище в памяти (для тестирования)
const blogs = new Map();
const posts = new Map();
const userStates = new Map();

// Функция для загрузки изображения
async function downloadImage(fileId, fileName) {
  try {
    const file = await bot.telegram.getFile(fileId);
    const filePath = file.file_path;
    const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
    
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const localPath = path.join(uploadDir, fileName);
    
    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(localPath);
      https.get(url, (response) => {
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(`/uploads/${fileName}`);
        });
      }).on('error', (err) => {
        fs.unlink(localPath, () => {}); // Удаляем файл при ошибке
        reject(err);
      });
    });
  } catch (error) {
    console.error('Ошибка при загрузке изображения:', error);
    throw error;
  }
}

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

// Команда создания блога
bot.command('create', async (ctx) => {
  const userId = ctx.from.id;
  
  // Проверяем, есть ли уже блог у пользователя
  const existingBlog = Array.from(blogs.values()).find(blog => blog.userId === userId);
  
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
  const blog = Array.from(blogs.values()).find(blog => blog.userId === userId);
  
  if (!blog) {
    ctx.reply('У вас еще нет блога. Используйте /create для создания блога.');
    return;
  }
  
  const userPosts = Array.from(posts.values()).filter(post => post.blogId === blog.id);
  
  if (userPosts.length === 0) {
    ctx.reply('В вашем блоге пока нет постов. Отправьте сообщение или изображение, чтобы создать первый пост!');
    userStates.set(userId, { state: 'creating_post', blogId: blog.id });
    return;
  }
  
  let message = '📝 Ваши посты:\n\n';
  userPosts.forEach((post, index) => {
    const date = new Date(post.createdAt).toLocaleDateString('ru-RU');
    message += `${index + 1}. ${post.title || 'Без названия'} (${date})\n`;
  });
  
  message += '\nОтправьте сообщение или изображение, чтобы создать новый пост, или используйте команды:\n';
  message += '/newpost - Создать новый пост\n';
  message += '/edit <номер> - Редактировать пост\n';
  message += '/delete <номер> - Удалить пост';
  
  ctx.reply(message);
  userStates.set(userId, { state: 'managing_posts', blogId: blog.id, posts: userPosts });
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
    postId: post.id 
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
  
  try {
    posts.delete(post.id);
    ctx.reply('Пост успешно удален!');
    
    // Обновляем список постов
    const updatedPosts = Array.from(posts.values()).filter(p => p.blogId === userState.blogId);
    userStates.set(userId, { 
      state: 'managing_posts', 
      blogId: userState.blogId, 
      posts: updatedPosts 
    });
  } catch (error) {
    ctx.reply('Ошибка при удалении поста. Попробуйте еще раз.');
  }
});

// Команда помощи
bot.command('help', (ctx) => {
  const helpMessage = `
📚 Помощь по командам:

/create - Создать новый блог
/posts - Управление постами
/edit <номер> - Редактировать пост
/delete <номер> - Удалить пост
/newpost - Создать новый пост
/help - Показать эту справку

💡 Отправьте текст или изображение, чтобы создать пост!
📸 Поддерживаются изображения с подписями
  `;
  
  ctx.reply(helpMessage);
});

// Команда для создания нового поста
bot.command('newpost', async (ctx) => {
  const userId = ctx.from.id;
  const blog = Array.from(blogs.values()).find(blog => blog.userId === userId);
  
  if (!blog) {
    ctx.reply('У вас еще нет блога. Используйте /create для создания блога.');
    return;
  }
  
  userStates.set(userId, { state: 'creating_post', blogId: blog.id });
  ctx.reply('Отправьте текст или изображение для нового поста:');
});

// Обработка фото с подписями
bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const userState = userStates.get(userId);
  const caption = ctx.message.caption || '';
  
  if (!userState) {
    ctx.reply('Используйте /create для создания блога или /posts для управления постами.');
    return;
  }
  
  try {
    // Получаем самое большое фото
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileName = `photo_${Date.now()}_${photo.file_id}.jpg`;
    
    // Загружаем изображение
    const imagePath = await downloadImage(photo.file_id, fileName);
    
    switch (userState.state) {
      case 'creating_post':
        const blog = blogs.get(userState.blogId);
        if (!blog) {
          ctx.reply('Блог не найден. Используйте /create для создания нового блога.');
          userStates.delete(userId);
          return;
        }
        
        const postId = Date.now().toString();
        const post = {
          id: postId,
          blogId: userState.blogId,
          content: caption || 'Изображение',
          title: caption.length > 50 ? caption.substring(0, 50) + '...' : (caption || 'Изображение'),
          image: imagePath,
          createdAt: new Date(),
          viewCount: 0,
          likes: 0
        };
        
        posts.set(postId, post);
        ctx.reply('✅ Пост с изображением успешно создан и опубликован в вашем блоге!');
        break;
        
      case 'managing_posts':
        const blog2 = blogs.get(userState.blogId);
        if (!blog2) {
          ctx.reply('Блог не найден. Используйте /create для создания нового блога.');
          userStates.delete(userId);
          return;
        }
        
        const postId2 = Date.now().toString();
        const post2 = {
          id: postId2,
          blogId: userState.blogId,
          content: caption || 'Изображение',
          title: caption.length > 50 ? caption.substring(0, 50) + '...' : (caption || 'Изображение'),
          image: imagePath,
          createdAt: new Date(),
          viewCount: 0,
          likes: 0
        };
        
        posts.set(postId2, post2);
        
        // Обновляем список постов
        const updatedPosts = Array.from(posts.values()).filter(p => p.blogId === userState.blogId);
        userStates.set(userId, { 
          state: 'managing_posts', 
          blogId: userState.blogId, 
          posts: updatedPosts 
        });
        
        ctx.reply('✅ Пост с изображением успешно создан и опубликован в вашем блоге! Отправьте еще одно сообщение или изображение, чтобы создать следующий пост.');
        break;
        
      default:
        ctx.reply('Отправьте /posts для управления постами или /newpost для создания нового поста.');
        break;
    }
  } catch (error) {
    console.error('Ошибка при обработке изображения:', error);
    ctx.reply('Ошибка при обработке изображения. Попробуйте еще раз.');
  }
});

// Обработка текстовых сообщений
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const userState = userStates.get(userId);
  const messageText = ctx.message.text;
  
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
        const existingBlog = Array.from(blogs.values()).find(blog => blog.subdomain === subdomain);
        if (existingBlog) {
          ctx.reply('Блог с таким названием уже существует. Попробуйте другое название:');
          return;
        }
        
        const blogId = Date.now().toString();
        const blog = {
          id: blogId,
          userId,
          name: blogName,
          subdomain,
          url: `http://localhost:3000/${subdomain}`,
          createdAt: new Date()
        };
        
        blogs.set(blogId, blog);
        userStates.delete(userId);
        
        ctx.reply(`🎉 Блог "${blogName}" успешно создан!\n\nВаш блог доступен по адресу: ${blog.url}\n\nТеперь отправляйте сообщения или изображения, чтобы создавать посты!`);
        
        // Устанавливаем состояние для создания постов
        userStates.set(userId, { state: 'creating_post', blogId: blog.id });
      } catch (error) {
        ctx.reply('Ошибка при создании блога. Попробуйте еще раз.');
      }
      break;
      
    case 'creating_post':
      try {
        const blog = blogs.get(userState.blogId);
        if (!blog) {
          ctx.reply('Блог не найден. Используйте /create для создания нового блога.');
          userStates.delete(userId);
          return;
        }
        
        const postId = Date.now().toString();
        const post = {
          id: postId,
          blogId: userState.blogId,
          content: messageText,
          title: messageText.length > 50 ? messageText.substring(0, 50) + '...' : messageText,
          createdAt: new Date(),
          viewCount: 0,
          likes: 0
        };
        
        posts.set(postId, post);
        ctx.reply('✅ Пост успешно создан и опубликован в вашем блоге!');
      } catch (error) {
        ctx.reply('Ошибка при создании поста. Попробуйте еще раз.');
      }
      break;
      
    case 'editing_post':
      try {
        const post = posts.get(userState.postId);
        if (post) {
          post.content = messageText;
          post.title = messageText.length > 50 ? messageText.substring(0, 50) + '...' : messageText;
          post.updatedAt = new Date();
          posts.set(userState.postId, post);
        }
        
        const updatedPosts = Array.from(posts.values()).filter(p => p.blogId === userState.blogId);
        userStates.set(userId, { 
          state: 'managing_posts', 
          blogId: userState.blogId,
          posts: updatedPosts
        });
        
        ctx.reply('✅ Пост успешно обновлен! Теперь вы можете отправлять новые сообщения для создания постов.');
      } catch (error) {
        ctx.reply('Ошибка при обновлении поста. Попробуйте еще раз.');
      }
      break;
      
    case 'managing_posts':
      // Создаем новый пост
      try {
        const blog = blogs.get(userState.blogId);
        if (!blog) {
          ctx.reply('Блог не найден. Используйте /create для создания нового блога.');
          userStates.delete(userId);
          return;
        }
        
        const postId = Date.now().toString();
        const post = {
          id: postId,
          blogId: userState.blogId,
          content: messageText,
          title: messageText.length > 50 ? messageText.substring(0, 50) + '...' : messageText,
          createdAt: new Date(),
          viewCount: 0,
          likes: 0
        };
        
        posts.set(postId, post);
        
        // Обновляем список постов
        const updatedPosts = Array.from(posts.values()).filter(p => p.blogId === userState.blogId);
        userStates.set(userId, { 
          state: 'managing_posts', 
          blogId: userState.blogId, 
          posts: updatedPosts 
        });
        
        ctx.reply('✅ Пост успешно создан и опубликован в вашем блоге! Отправьте еще одно сообщение, чтобы создать следующий пост.');
      } catch (error) {
        ctx.reply('Ошибка при создании поста. Попробуйте еще раз.');
      }
      break;
  }
});

// API маршруты для веб-интерфейса
app.get('/api/blogs/:subdomain', async (req, res) => {
  try {
    const blog = Array.from(blogs.values()).find(b => b.subdomain === req.params.subdomain);
    if (!blog) {
      return res.status(404).json({ error: 'Блог не найден' });
    }
    
    const blogPosts = Array.from(posts.values()).filter(p => p.blogId === blog.id);
    res.json({ blog, posts: blogPosts });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Маршрут для отображения блога
app.get('/:subdomain', async (req, res) => {
  try {
    const blog = Array.from(blogs.values()).find(b => b.subdomain === req.params.subdomain);
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
    
    const blogPosts = Array.from(posts.values()).filter(p => p.blogId === blog.id);
    
    res.send(`
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${blog.name}</title>
        <meta name="description" content="Персональный блог">
        <link rel="stylesheet" href="/css/style.css">
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📝</text></svg>">
      </head>
      <body>
        <div class="container">
          
          <div class="blog-header">
            <h1 class="blog-title">${blog.name}</h1>
          </div>
          
          <div class="posts">
            ${blogPosts.length === 0 ? `
              <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <div class="empty-state-title">Пока нет постов</div>
                <div class="empty-state-text">
                  Автор блога еще не опубликовал ни одного поста.<br>
                  Следите за обновлениями!
                </div>
              </div>
            ` : blogPosts.map(post => `
              <article class="post">
                <h2 class="post-title">${post.title}</h2>
                ${post.image ? `<div class="post-image"><img src="${post.image}" alt="${post.title}" loading="lazy"></div>` : ''}
                <div class="post-content">${post.content.replace(/\n/g, '<br>')}</div>
                <div class="post-meta">
                  <div class="post-date">
                    ${new Date(post.createdAt).toLocaleDateString('ru-RU', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                  <div class="post-stats">
                    <span class="post-stat views">${post.viewCount || 0}</span>
                    <span class="post-stat likes">${post.likes || 0}</span>
                  </div>
                </div>
              </article>
            `).join('')}
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Ошибка при отображении блога:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ошибка сервера</title>
        <link rel="stylesheet" href="/css/style.css">
      </head>
      <body>
        <div class="container">
          <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <div class="empty-state-title">Ошибка сервера</div>
            <div class="empty-state-text">Произошла ошибка при загрузке блога. Попробуйте позже.</div>
          </div>
        </div>
      </body>
      </html>
    `);
  }
});

// Главная страница
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>TeleBlog - Создание блогов через Telegram</title>
      <link rel="stylesheet" href="/css/style.css">
    </head>
    <body>
      <div class="container">
        <div class="blog-header">
          <h1 class="blog-title">TeleBlog</h1>
          <p class="blog-subtitle">Создавайте блоги прямо из Telegram</p>
        </div>
        
        <div class="empty-state">
          <div class="empty-state-icon">📱</div>
          <div class="empty-state-title">Добро пожаловать в TeleBlog!</div>
          <div class="empty-state-text">
            Это платформа для создания персональных блогов через Telegram.<br>
            Найдите нашего бота в Telegram и начните создавать свой блог!
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Запуск бота и сервера
const PORT = process.env.PORT || 3000;

bot.launch().then(() => {
  console.log('🤖 Telegram бот запущен');
});

app.listen(PORT, () => {
  console.log(`🌐 Веб-сервер запущен на порту ${PORT}`);
  console.log(`📱 Найдите вашего бота в Telegram и отправьте /start`);
  console.log(`🌐 Главная страница: http://localhost:${PORT}`);
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 
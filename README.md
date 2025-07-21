# TeleBlog - Telegram Bot для создания блогов

TeleBlog - это телеграм-бот, который позволяет создавать и управлять персональными блогами прямо из Telegram. Каждый пользователь получает индивидуальный поддомен для своего блога.

## 🚀 Возможности

- ✅ Создание персонального блога с индивидуальным поддоменом
- ✅ Публикация постов через Telegram сообщения
- ✅ Редактирование и удаление постов
- ✅ Автоматическое обновление блога при публикации
- ✅ Современный веб-интерфейс для блогов
- ✅ API для интеграции с внешними сервисами

## 📋 Требования

- Node.js 14+ 
- MongoDB
- Telegram Bot Token (от @BotFather)

## 🛠 Установка

1. **Клонируйте репозиторий:**
```bash
git clone <repository-url>
cd teleblog-new
```

2. **Установите зависимости:**
```bash
npm install
```

3. **Создайте файл .env:**
```bash
cp .env.example .env
```

4. **Настройте переменные окружения в .env:**
```env
# Telegram Bot Token (получите у @BotFather)
BOT_TOKEN=your_telegram_bot_token_here

# MongoDB Connection String
MONGODB_URI=mongodb://localhost:27017/teleblog

# Server Port
PORT=3000

# Domain for blogs (замените на ваш домен)
DOMAIN=yourdomain.com
```

5. **Запустите MongoDB:**
```bash
# Локально
mongod

# Или используйте MongoDB Atlas
```

6. **Запустите бота:**
```bash
# Для разработки
npm run dev

# Для продакшена
npm start
```

## 🤖 Как получить Telegram Bot Token

1. Найдите @BotFather в Telegram
2. Отправьте команду `/newbot`
3. Следуйте инструкциям для создания бота
4. Скопируйте полученный токен в файл `.env`

## 📱 Использование бота

### Основные команды:

- `/start` - Начать работу с ботом
- `/create` - Создать новый блог
- `/posts` - Управление постами
- `/edit <номер>` - Редактировать пост
- `/delete <номер>` - Удалить пост
- `/help` - Показать справку

### Пошаговая инструкция:

1. **Создание блога:**
   - Отправьте `/create`
   - Введите название для блога
   - Получите ссылку на ваш блог

2. **Создание постов:**
   - Просто отправьте сообщение боту
   - Пост автоматически появится в вашем блоге

3. **Управление постами:**
   - Используйте `/posts` для просмотра списка
   - `/edit 1` для редактирования первого поста
   - `/delete 1` для удаления первого поста

## 🌐 Структура URL

Блоги доступны по адресу:
```
https://{subdomain}.yourdomain.com
```

Где `{subdomain}` - это название блога в нижнем регистре без специальных символов.

## 📊 API Endpoints

### Получить блог и посты:
```
GET /api/blogs/{subdomain}
```

### Получить конкретный пост:
```
GET /api/blogs/{subdomain}/posts/{postId}
```

### Просмотр блога:
```
GET /{subdomain}
```

## 🗄 Структура базы данных

### Коллекция Blogs:
```javascript
{
  userId: Number,        // Telegram User ID
  name: String,          // Название блога
  subdomain: String,     // Поддомен
  url: String,           // Полный URL
  description: String,   // Описание
  theme: String,         // Тема оформления
  isActive: Boolean,     // Активен ли блог
  createdAt: Date,       // Дата создания
  updatedAt: Date        // Дата обновления
}
```

### Коллекция Posts:
```javascript
{
  blogId: ObjectId,      // Ссылка на блог
  title: String,         // Заголовок поста
  content: String,       // Содержимое поста
  excerpt: String,       // Краткое описание
  tags: [String],        // Теги
  isPublished: Boolean,  // Опубликован ли
  publishedAt: Date,     // Дата публикации
  viewCount: Number,     // Количество просмотров
  likes: Number,         // Количество лайков
  createdAt: Date,       // Дата создания
  updatedAt: Date        // Дата обновления
}
```

## 🔧 Настройка домена

Для работы с поддоменами необходимо настроить DNS и веб-сервер:

### Nginx конфигурация:
```nginx
server {
    listen 80;
    server_name *.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Wildcard DNS запись:
```
*.yourdomain.com A your_server_ip
```

## 🚀 Развертывание

### Heroku:
```bash
heroku create your-teleblog-app
heroku config:set BOT_TOKEN=your_bot_token
heroku config:set MONGODB_URI=your_mongodb_uri
heroku config:set DOMAIN=yourdomain.com
git push heroku main
```

### Docker:
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🤝 Вклад в проект

1. Fork репозиторий
2. Создайте ветку для новой функции
3. Внесите изменения
4. Создайте Pull Request

## 📄 Лицензия

MIT License

## 🆘 Поддержка

Если у вас возникли вопросы или проблемы:
- Создайте Issue в репозитории
- Обратитесь к документации
- Проверьте логи приложения

## 🔮 Планы развития

- [ ] Поддержка изображений и медиафайлов
- [ ] Кастомные темы оформления
- [ ] Комментарии к постам
- [ ] Аналитика просмотров
- [ ] RSS ленты
- [ ] SEO оптимизация
- [ ] Многоязычная поддержка 
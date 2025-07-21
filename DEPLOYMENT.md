# 🚀 Руководство по развертыванию TeleBlog

Это руководство поможет вам развернуть TeleBlog на различных платформах.

## 📋 Предварительные требования

1. **Telegram Bot Token** - получите у @BotFather
2. **MongoDB** - локально или в облаке (MongoDB Atlas)
3. **Домен** - для поддоменов блогов
4. **Node.js 14+** - на сервере

## 🔧 Локальная разработка

### 1. Установка зависимостей
```bash
npm install
```

### 2. Настройка MongoDB
```bash
# Установка MongoDB (macOS)
brew install mongodb-community

# Запуск MongoDB
brew services start mongodb-community

# Или вручную
mongod --dbpath /usr/local/var/mongodb
```

### 3. Создание .env файла
Создайте файл `.env` в корне проекта:
```env
BOT_TOKEN=your_telegram_bot_token_here
MONGODB_URI=mongodb://localhost:27017/teleblog
PORT=3000
DOMAIN=localhost:3000
```

### 4. Запуск в режиме разработки
```bash
npm run dev
```

## ☁️ Развертывание в облаке

### Heroku

1. **Установите Heroku CLI:**
```bash
# macOS
brew install heroku/brew/heroku

# Или скачайте с https://devcenter.heroku.com/articles/heroku-cli
```

2. **Создайте приложение:**
```bash
heroku create your-teleblog-app
```

3. **Добавьте MongoDB:**
```bash
heroku addons:create mongolab:sandbox
```

4. **Настройте переменные окружения:**
```bash
heroku config:set BOT_TOKEN=your_telegram_bot_token
heroku config:set DOMAIN=your-teleblog-app.herokuapp.com
```

5. **Разверните приложение:**
```bash
git add .
git commit -m "Initial deployment"
git push heroku main
```

6. **Запустите приложение:**
```bash
heroku ps:scale web=1
```

### Railway

1. **Подключите GitHub репозиторий к Railway**
2. **Добавьте переменные окружения:**
   - `BOT_TOKEN`
   - `MONGODB_URI`
   - `DOMAIN`

3. **Railway автоматически развернет приложение**

### DigitalOcean App Platform

1. **Создайте приложение в DigitalOcean**
2. **Подключите GitHub репозиторий**
3. **Настройте переменные окружения**
4. **Выберите план и разверните**

## 🐳 Docker развертывание

### 1. Создайте Dockerfile
```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

### 2. Создайте docker-compose.yml
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - BOT_TOKEN=${BOT_TOKEN}
      - MONGODB_URI=mongodb://mongo:27017/teleblog
      - DOMAIN=${DOMAIN}
    depends_on:
      - mongo
    restart: unless-stopped

  mongo:
    image: mongo:5
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    restart: unless-stopped

volumes:
  mongo_data:
```

### 3. Запустите с Docker Compose
```bash
docker-compose up -d
```

## 🌐 Настройка домена и поддоменов

### 1. Настройка DNS

Добавьте wildcard DNS запись:
```
*.yourdomain.com A your_server_ip
```

### 2. Nginx конфигурация

Создайте файл `/etc/nginx/sites-available/teleblog`:
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
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
    }
    
    # Увеличиваем лимиты для загрузки файлов
    client_max_body_size 10M;
    proxy_read_timeout 300;
    proxy_connect_timeout 300;
    proxy_send_timeout 300;
}
```

Активируйте конфигурацию:
```bash
sudo ln -s /etc/nginx/sites-available/teleblog /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3. SSL сертификаты (Let's Encrypt)

```bash
# Установите Certbot
sudo apt install certbot python3-certbot-nginx

# Получите сертификат для wildcard домена
sudo certbot --nginx -d yourdomain.com -d *.yourdomain.com
```

## 🔒 Безопасность

### 1. Переменные окружения
- Никогда не коммитьте `.env` файл
- Используйте секреты в облачных платформах
- Регулярно обновляйте токены

### 2. MongoDB безопасность
```javascript
// В production используйте аутентификацию
MONGODB_URI=mongodb://username:password@host:port/database?authSource=admin
```

### 3. Rate Limiting
Добавьте rate limiting для API:
```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100 // максимум 100 запросов с одного IP
});

app.use('/api/', limiter);
```

## 📊 Мониторинг

### 1. Логирование
```javascript
// Добавьте логирование
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

### 2. Health Check
```javascript
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

### 3. PM2 (для production)
```bash
npm install -g pm2

# Создайте ecosystem.config.js
pm2 ecosystem

# Запустите приложение
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 🔄 CI/CD

### GitHub Actions
Создайте `.github/workflows/deploy.yml`:
```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    
    - name: Deploy to Heroku
      uses: akhileshns/heroku-deploy@v3.12.12
      with:
        heroku_api_key: ${{ secrets.HEROKU_API_KEY }}
        heroku_app_name: ${{ secrets.HEROKU_APP_NAME }}
        heroku_email: ${{ secrets.HEROKU_EMAIL }}
```

## 🚨 Устранение неполадок

### Частые проблемы:

1. **Бот не отвечает:**
   - Проверьте токен в .env
   - Убедитесь, что бот запущен
   - Проверьте логи

2. **Ошибки MongoDB:**
   - Проверьте строку подключения
   - Убедитесь, что MongoDB запущен
   - Проверьте права доступа

3. **Поддомены не работают:**
   - Проверьте DNS настройки
   - Убедитесь, что wildcard запись добавлена
   - Проверьте Nginx конфигурацию

### Полезные команды:
```bash
# Проверка статуса приложения
pm2 status

# Просмотр логов
pm2 logs

# Перезапуск приложения
pm2 restart all

# Проверка MongoDB
mongo --eval "db.adminCommand('ping')"

# Проверка Nginx
sudo nginx -t
sudo systemctl status nginx
```

## 📈 Масштабирование

### Горизонтальное масштабирование:
1. Используйте Redis для сессий
2. Настройте балансировщик нагрузки
3. Используйте MongoDB Atlas для базы данных

### Вертикальное масштабирование:
1. Увеличьте ресурсы сервера
2. Оптимизируйте запросы к базе данных
3. Добавьте кэширование

## 🎯 Production чек-лист

- [ ] Все переменные окружения настроены
- [ ] SSL сертификаты установлены
- [ ] MongoDB защищена аутентификацией
- [ ] Rate limiting настроен
- [ ] Логирование включено
- [ ] Мониторинг настроен
- [ ] Backup стратегия реализована
- [ ] CI/CD настроен
- [ ] Документация обновлена 
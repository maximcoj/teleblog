#!/bin/bash

echo "🚀 Запуск TeleBlog..."

# Проверяем наличие .env файла
if [ ! -f .env ]; then
    echo "❌ Файл .env не найден!"
    echo "📝 Создайте файл .env со следующими переменными:"
    echo ""
    echo "BOT_TOKEN=your_telegram_bot_token_here"
    echo "MONGODB_URI=mongodb://localhost:27017/teleblog"
    echo "PORT=3000"
    echo "DOMAIN=localhost:3000"
    echo ""
    echo "💡 Получите токен бота у @BotFather в Telegram"
    exit 1
fi

# Проверяем, установлены ли зависимости
if [ ! -d "node_modules" ]; then
    echo "📦 Установка зависимостей..."
    npm install
fi

# Проверяем, запущен ли MongoDB
echo "🔍 Проверка MongoDB..."
if ! pgrep -x "mongod" > /dev/null; then
    echo "⚠️  MongoDB не запущен"
    echo "💡 Запустите MongoDB командой:"
    echo "   brew services start mongodb-community"
    echo "   или"
    echo "   mongod"
    echo ""
    echo "🔄 Продолжить без MongoDB? (y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ MongoDB запущен"
fi

# Запускаем приложение
echo "🎯 Запуск TeleBlog..."
echo "📱 Бот будет доступен в Telegram"
echo "🌐 Веб-интерфейс: http://localhost:3000"
echo ""
echo "🛑 Для остановки нажмите Ctrl+C"
echo ""

npm start 
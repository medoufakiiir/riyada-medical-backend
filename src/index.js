require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

app.set('trust proxy', 1);

const PROD_ORIGINS = ['https://rc.riyada-ventures.com'];
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4173'];

app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? PROD_ORIGINS : [...PROD_ORIGINS, ...DEV_ORIGINS],
}));
app.use(express.json());

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const formLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

app.use('/auth', require('./routes/auth'));
app.use('/bookings', formLimiter);
app.use('/contact', formLimiter);
app.use('/chat', chatLimiter);
app.use('/',     require('./routes/public'));
app.use('/admin/dashboard', require('./routes/dashboard'));
app.use('/admin/bookings',  require('./routes/bookings'));
app.use('/admin/messages',  require('./routes/messages'));
app.use('/admin/services',  require('./routes/services'));
app.use('/admin/packages',  require('./routes/packages'));
app.use('/admin/team',      require('./routes/team'));
app.use('/admin/users',     require('./routes/users'));
app.use('/admin/settings',  require('./routes/settings'));
app.use('/admin/chatbot',   require('./routes/chatbot-admin'));
app.use('/admin/analytics', require('./routes/analytics'));
app.use('/admin/contacts',  require('./routes/contacts'));
app.use('/admin/calendar',  require('./routes/calendar'));
app.use('/chat',            require('./routes/chat'));

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Riyada Admin API listening on http://localhost:${PORT}`));

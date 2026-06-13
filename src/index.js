require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4173'] }));
app.use(express.json());

app.use('/auth', require('./routes/auth'));
app.use('/',     require('./routes/public'));
app.use('/admin/dashboard', require('./routes/dashboard'));
app.use('/admin/bookings',  require('./routes/bookings'));
app.use('/admin/messages',  require('./routes/messages'));
app.use('/admin/services',  require('./routes/services'));
app.use('/admin/packages',  require('./routes/packages'));
app.use('/admin/team',      require('./routes/team'));
app.use('/admin/settings',  require('./routes/settings'));

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Riyada Admin API listening on http://localhost:${PORT}`));

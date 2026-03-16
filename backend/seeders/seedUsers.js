const { loadBackendEnv } = require('../config/runtime');
loadBackendEnv();

const { sequelize, User } = require('../models');

// Demo users in Beirut area (lat 33.85-33.95, lon 35.45-35.55)
const demoUsers = [
    { name: 'Ahmad Hassan', email: 'ahmad.hassan@email.com', phone: '+961-3-123-4501', lang: 'ar' },
    { name: 'Fatima Khoury', email: 'fatima.khoury@email.com', phone: '+961-3-123-4502', lang: 'ar' },
    { name: 'Michel Gemayel', email: 'michel.gemayel@email.com', phone: '+961-3-123-4503', lang: 'en' },
    { name: 'Nour Sleiman', email: 'nour.sleiman@email.com', phone: '+961-3-123-4504', lang: 'ar' },
    { name: 'Karim Bazzi', email: 'karim.bazzi@email.com', phone: '+961-3-123-4505', lang: 'en' },
    { name: 'Layla Hariri', email: 'layla.hariri@email.com', phone: '+961-3-123-4506', lang: 'ar' },
    { name: 'Georges Haddad', email: 'georges.haddad@email.com', phone: '+961-3-123-4507', lang: 'en' },
    { name: 'Rima Saad', email: 'rima.saad@email.com', phone: '+961-3-123-4508', lang: 'ar' },
    { name: 'Walid Nassar', email: 'walid.nassar@email.com', phone: '+961-3-123-4509', lang: 'ar' },
    { name: 'Sarah Moussa', email: 'sarah.moussa@email.com', phone: '+961-3-123-4510', lang: 'en' },
    { name: 'Omar Fayad', email: 'omar.fayad@email.com', phone: '+961-3-123-4511', lang: 'ar' },
    { name: 'Nadine Karam', email: 'nadine.karam@email.com', phone: '+961-3-123-4512', lang: 'en' },
    { name: 'Hassan Abboud', email: 'hassan.abboud@email.com', phone: '+961-3-123-4513', lang: 'ar' },
    { name: 'Maya Tannous', email: 'maya.tannous@email.com', phone: '+961-3-123-4514', lang: 'en' },
    { name: 'Ali Khalil', email: 'ali.khalil@email.com', phone: '+961-3-123-4515', lang: 'ar' },
    { name: 'Christina Aoun', email: 'christina.aoun@email.com', phone: '+961-3-123-4516', lang: 'en' },
    { name: 'Mahmoud Itani', email: 'mahmoud.itani@email.com', phone: '+961-3-123-4517', lang: 'ar' },
    { name: 'Rita Frem', email: 'rita.frem@email.com', phone: '+961-3-123-4518', lang: 'en' },
    { name: 'Khaled Safa', email: 'khaled.safa@email.com', phone: '+961-3-123-4519', lang: 'ar' },
    { name: 'Zeina Rahal', email: 'zeina.rahal@email.com', phone: '+961-3-123-4520', lang: 'ar' },
    { name: 'Tony Saliba', email: 'tony.saliba@email.com', phone: '+961-3-123-4521', lang: 'en' },
    { name: 'Hala Zreik', email: 'hala.zreik@email.com', phone: '+961-3-123-4522', lang: 'ar' },
    { name: 'Elie Daher', email: 'elie.daher@email.com', phone: '+961-3-123-4523', lang: 'en' },
    { name: 'Mona Chahine', email: 'mona.chahine@email.com', phone: '+961-3-123-4524', lang: 'ar' },
    { name: 'Fadi Younes', email: 'fadi.younes@email.com', phone: '+961-3-123-4525', lang: 'en' },
    { name: 'Dima Azar', email: 'dima.azar@email.com', phone: '+961-3-123-4526', lang: 'ar' },
    { name: 'Joseph Nasr', email: 'joseph.nasr@email.com', phone: '+961-3-123-4527', lang: 'en' },
    { name: 'Lina Hajj', email: 'lina.hajj@email.com', phone: '+961-3-123-4528', lang: 'ar' },
    { name: 'Samer Makdisi', email: 'samer.makdisi@email.com', phone: '+961-3-123-4529', lang: 'en' },
    { name: 'Tala Obeid', email: 'tala.obeid@email.com', phone: '+961-3-123-4530', lang: 'ar' }
];

// Generate random coordinates in Beirut area
function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
}

async function seedUsers() {
    try {
        console.log('Connecting to database...');
        await sequelize.authenticate();
        console.log('Database connected!');

        // Sync database (create tables)
        console.log('Syncing database schema...');
        await sequelize.sync({ alter: true });
        console.log('Schema synced!');

        // Clear existing users
        console.log('Clearing existing users...');
        await User.destroy({ where: {} });

        // Create demo users
        console.log('Creating 30 demo users in Beirut area...');
        const users = [];

        for (const userData of demoUsers) {
            const lat = randomInRange(33.85, 33.95);
            const lon = randomInRange(35.45, 35.55);

            users.push({
                name: userData.name,
                email: userData.email,
                phone_number: userData.phone,
                preferred_language: userData.lang,
                lat: lat.toFixed(7),
                lon: lon.toFixed(7),
                country: 'Lebanon',
                carrier: 'Touch',
                accessibility_needs: []
            });
        }

        await User.bulkCreate(users);

        console.log(`✅ Successfully created ${users.length} demo users!`);
        console.log('Sample users:');
        const sampleUsers = await User.findAll({ limit: 5 });
        sampleUsers.forEach(u => {
            console.log(`  - ${u.name} (${u.preferred_language}): ${u.lat}, ${u.lon}`);
        });

        process.exit(0);

    } catch (error) {
        console.error('Seeding error:', error);
        process.exit(1);
    }
}

seedUsers();

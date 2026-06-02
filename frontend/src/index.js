require('./styles/global.css');

// Import all page-specific CSS so it's processed
const requireAll = (r) => r.keys().forEach(r);
requireAll(require.context('./styles/pages/', true, /\.css$/));

// Import JS
require('./js/loader.js');
require('./js/main.js');
require('./js/admin.js');

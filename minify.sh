find ./scripts/ -maxdepth 3 -iname "*.js" -exec ./node_modules/uglify-js/bin/uglifyjs --compress --mangle -o {} -- {} \;
./node_modules/uglify-js/bin/uglifyjs main.js --compress --mangle -o main.js

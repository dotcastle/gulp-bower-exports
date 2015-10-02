@echo on
copy /Y "plugin.js" "gulp-bower-exports.js"
copy /Y "package.json" ".."
copy /Y "plugin.js" "..\index.js"
copy /Y "..\test\bower-exports.json" "..\config"

cd ..
md package 2> nul
copy /Y "index.js" "package"
copy /Y "package.json" "package"

cd test
call npm uninstall gulp-bower-exports 2> nul
call npm install ../package

cd ..
rd /S /Q package
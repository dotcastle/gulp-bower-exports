@echo off
cd /D %~dp0

:: http://code.kliu.org/misc/elevate/
node-debug "node_modules\gulp\bin\gulp.js" default
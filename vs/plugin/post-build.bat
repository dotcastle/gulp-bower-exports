@ECHO ON

COPY /Y "package.json" "..\.."
COPY /Y "bower-exports-schema.json" "..\.."

CD ..\..
CALL "vs\plugin\delete-empty.bat" 2> nul

DEL /F /Q index.js 2> NUL
REN plugin.js index.js
DEL /F /Q plugin-options.js 2> NUL

COPY /Y bower-exports-schema.json vs\test
CALL tools\delete-path.exe vs\test\node_modules\gulp-bower-exports
MD vs\test\node_modules\gulp-bower-exports
COPY /Y index.js vs\test\node_modules\gulp-bower-exports
COPY /Y package.json vs\test\node_modules\gulp-bower-exports
COPY /Y readme.md vs\test\node_modules\gulp-bower-exports
COPY /Y license vs\test\node_modules\gulp-bower-exports
MD vs\test\node_modules\gulp-bower-exports\lib
XCOPY lib\*.* vs\test\node_modules\gulp-bower-exports\lib /S /X /Q /H /R /Y
CD vs\test\node_modules\gulp-bower-exports
CALL npm install

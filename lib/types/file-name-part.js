/**
 * File name part
 */
var FileNamePart;
(function (FileNamePart) {
    FileNamePart[FileNamePart["FullName"] = 0] = "FullName";
    FileNamePart[FileNamePart["DirName"] = 1] = "DirName";
    FileNamePart[FileNamePart["FileName"] = 2] = "FileName";
    FileNamePart[FileNamePart["BaseName"] = 3] = "BaseName";
    FileNamePart[FileNamePart["ExtName"] = 4] = "ExtName";
})(FileNamePart || (FileNamePart = {}));
module.exports = FileNamePart;

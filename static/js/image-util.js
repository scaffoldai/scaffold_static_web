// depends on https://github.com/blueimp/JavaScript-Load-Image
function rotateImgByEXIF(data_url, callback) {
  loadImage(
    data_url,
    function (canvas) {
        callback(canvas.toDataURL());
    },
    {
        canvas: true,
        orientation: true
    }
  );
}

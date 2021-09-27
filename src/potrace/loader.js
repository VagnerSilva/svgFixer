'use strict';

const jimp = require('jimp');
const error = require('./error');
const is = require('oslllo-validator');
const Bitmap = require('./types/Bitmap');
const { Canvas, Image } = require('skia-canvas');

const Loader = function (dom) {
    this.document = dom.window.document;
};

Loader.prototype = {
    image: function (image) {
        return new Promise(async (resolve, reject) => {
            if (!is.buffer(image) && !is.string(image)) {
                var err = error.invalidParameterError(
                    'image',
                    'buffer or path to image',
                    image
                );
                return reject(err);
            }
            var element = new Image(0, 0);
            image = await jimp.read(image);
            var base64 = await image.getBase64Async(jimp.AUTO);
            element.onload = () => {
                var data = {
                    file: image,
                    base64: base64,
                    element: element,
                };
                resolve(data);
            };
            element.src = base64;

            var data = {
                file: image,
                base64: base64,
                element: element,
            };
            resolve(data);
        });
    },
    canvas: function (image) {
        var { element } = image;
        var canvas = new Canvas();
        canvas.width = element.width;
        canvas.height = element.height;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(element, 0, 0);

        return canvas;
    },
    bitmap: function (canvas, info) {
        var ctx = canvas.getContext('2d');
        var bitmap = new Bitmap(canvas.width, canvas.height, info);
        var imageDataObject = ctx.getImageData(0, 0, bitmap.w, bitmap.h);
        var l = imageDataObject.data.length,
            i,
            j,
            color;
        for (i = 0, j = 0; i < l; i += 4, j++) {
            color =
                0.2126 * imageDataObject.data[i] +
                0.7153 * imageDataObject.data[i + 1] +
                0.0721 * imageDataObject.data[i + 2];
            bitmap.data[j] = color < 128 ? 1 : 0;
        }

        return bitmap;
    },
};

module.exports = Loader;

const fs = require('fs');
const fg = require('fast-glob');
const Potrace = require('./potrace/index');
const { createCanvas, close, loadImage } = require('puppet-canvas');
const is = require('oslllo-validator');
const { JSDOM } = require('jsdom');
const error = require('./error');
const Options2 = require('./option2');
const Processor2 = require('./processor2');
const constants = require('./constants');
const formats = constants.FORMATS;

class Svg {
    constructor(path) {
        this.filled = false;
        this.path = path;
        this.html = fs.readFileSync(this.path, 'utf-8');
        this.element = this.toElement();
        this.outerHTML = this.element.outerHTML;
        this.svg = this;
        this.original = this.getOriginal();
        this.resized = this.getResized();
        this.scale = this.getScale();
        this.options = new Options2();
        this.processor = new Processor2(this);
        this.output = {
            file: undefined,
            format: undefined,
            resize: undefined,
            extend: undefined,
            background: undefined,
        };
    }

    getResized() {
        const element = this.resize(this.getResizeDimensions());
        const dimensions = this.dimensions(element.outerHTML);
        return { element, dimensions };
    }

    getResizeDimensions() {
        const width = 600;
        const dimensions = {
            width: width,
            height:
                (width / this.original.dimensions.width) *
                this.original.dimensions.height,
        };

        return dimensions;
    }

    getOriginal() {
        var element = this.element.cloneNode(true);
        var dimensions = this.svg.dimensions();
        var attributes = this.getAttributes(element);

        return { element, dimensions, attributes };
    }
    getScale() {
        return this.original.dimensions.width / this.resized.dimensions.width;
    }

    getAttributes(element) {
        return Object.values(element.attributes).map(function (attribute) {
            /**
             * Ignore <path></path> "d" attribute.
             */
            if (attribute.name !== 'd') {
                return { name: attribute.name, value: attribute.value };
            }

            return false;
        });
    }

    resetAttributes(element, attributes) {
        var i = element.attributes.length;
        while (i >= 0) {
            var attribute = element.attributes[i];
            /**
             * Ignore <path></path> "d" attribute.
             */
            if (attribute && attribute.name !== 'd') {
                element.removeAttribute(attribute.name);
            }
            i--;
        }
        this.setAttributes(element, attributes);
    }

    valueIsNotBlack(value) {
        return value !== '#000' && value !== 'black';
    }

    setAttributes(element, attributes) {
        attributes.forEach((attribute) => {
            if (attribute) {
                if (element.tagName.toLowerCase() === 'path') {
                    if (
                        (attribute.name === 'stroke' &&
                            this.valueIsNotBlack(attribute.value)) ||
                        (attribute.name === 'fill' &&
                            this.valueIsNotBlack(attribute.value))
                    ) {
                        element.setAttribute(attribute.name, attribute.value);
                    }
                } else {
                    element.setAttribute(attribute.name, attribute.value);
                }
            }
        });

        if (element.tagName.toLowerCase() === 'path') {
            [
                { name: 'stroke', value: 'none' },
                { name: 'fill-rule', value: 'evenodd' },
            ].forEach((attr) => {
                element.setAttribute(attr.name, attr.value);
            });

            if (!this.filled) {
                const pathColor = this.getPathStyleFillColor();
                const fill = pathColor ? pathColor : 'black';
                element.setAttribute('fill', fill);
            }
        }
    }

    getFirstPathElement(element) {
        return element.getElementsByTagName('path')[0];
    }

    getPathStyleFillColor() {
        var path = this.getFirstPathElement(this.original.element);
        var style = path.getAttribute('style');
        if (!style) {
            return false;
        }
        var fill = style.split(';').find((e) => e.includes('fill:'));
        if (fill && !fill.includes('none')) {
            const splits = fill.split(':');

            // eslint-disable-next-line no-magic-numbers
            return splits[splits.length - 1];
        }

        return false;
    }

    hasFill(el) {
        if (Object.prototype.hasOwnProperty.call(el.attributes, 'fill')) {
            if (el.attributes.fill.value !== 'none') {
                this.filled = true;

                return true;
            }
        }

        return false;
    }

    setFillBlack(el) {
        el.setAttribute('fill', '#000');
    }

    checkFillState(el) {
        var path = this.getFirstPathElement(el);
        if (path && this.hasFill(path)) {
            this.setFillBlack(path);
        } else if (this.hasFill(el)) {
            this.setFillBlack(el);
        }

        return el;
    }

    toElement(input) {
        input = input ? input : this.html;

        return new JSDOM(input, {
            resources: 'usable',
        }).window.document.getElementsByTagName('svg')[0];
    }

    dimensions(input) {
        var svg = this.toElement(input);

        var dimension = {
            names: ['width', 'height'],
            data: { width: 0, height: 0 },
        };
        var dn = dimension.names;
        var dd = dimension.data;
        if (svg.hasAttribute(dn[0]) && svg.hasAttribute(dn[1])) {
            var width = svg.getAttribute(dn[0]);
            var height = svg.getAttribute(dn[1]);
            if (!width.includes('%') && !height.includes('%')) {
                for (var i = 0; i < dn.length; i++) {
                    var name = dn[i];
                    switch (name) {
                        case 'width':
                            dd.width = this.dimensionToPx(width);
                            break;
                        case 'height':
                            dd.height = this.dimensionToPx(height);
                            break;
                    }
                }
            } else {
                var viewbox = this.viewBox(svg);
                dd.width = viewbox.width;
                dd.height = viewbox.height;
            }
        } else {
            var viewbox = this.viewBox(svg);
            dd.width = viewbox.width;
            dd.height = viewbox.height;
        }
        return dd;
    }

    dimensionToPx(input) {
        if (!input || (typeof input != 'string' && typeof input != 'number')) {
            throw error.invalidParameterError(
                'input',
                'string with dimension or number',
                input
            );
        }
        var units = ['rem', 'px', 'em'];
        for (var i = 0; i < units.length; i++) {
            var unit = units[i];
            if (input.search(unit) !== -1) {
                input = input.replace(unit, '');
                if (unit === 'px') {
                    break;
                } else if (unit === 'em' || unit === 'rem') {
                    input = input * 16;
                    break;
                }
            }
        }
        var dimension = Number(input);
        if (isNaN(dimension)) {
            throw error.invalidParameterError(
                'input',
                'a valid dimension i.e 20px, 20rem, 20em or 20',
                input
            );
        }
        return dimension;
    }

    resize(input) {
        if (input.constructor.name !== 'Object' && !is.number(input)) {
            throw error.invalidParameterError(
                'input',
                'object or number',
                input
            );
        }
        var svg = this.toElement();
        var current = this.dimensions();
        var output = {
            scale: 0,
            width: undefined,
            height: undefined,
        };
        function set(dimension) {
            var opposite = dimension == 'height' ? 'width' : 'height';
            output[dimension] = input[dimension];
            if (input[opposite] === constants.AUTO) {
                output[opposite] =
                    input[dimension] - current[dimension] + current[opposite];
            } else {
                output[opposite] = current[opposite];
            }
            // output.scale = input[dimension] / current[dimension];
            return output;
        }
        if (Number(input)) {
            output.width = current.width * input;
            output.height = current.height * input;
            output.scale = input;
        } else {
            if (
                input.width !== constants.AUTO &&
                input.height !== constants.AUTO
            ) {
                output.width = input.width;
                output.height = input.height;
            } else if (
                is.defined(input.width) &&
                input.width !== constants.AUTO
            ) {
                output = set('width');
            } else if (
                is.defined(input.height) &&
                input.height !== constants.AUTO
            ) {
                output = set('height');
            } else {
                throw error.invalidParameterError(
                    'input',
                    'width or height in object',
                    input
                );
            }
            output.scale =
                (output.width / current.width +
                    output.height / current.height) /
                2;
        }
        svg.setAttribute('width', output.width);
        svg.setAttribute('height', output.height);

        return svg;
    }

    viewBox(svg) {
        if (!svg.hasAttribute('viewBox')) {
            throw error.invalidParameterError(
                'SVG dimension',
                'height/width and viewBox attributes to be set',
                this.html
            );
        }
        var viewBox = svg.getAttribute('viewBox').split(' ');
        return {
            'min-x': Number(viewBox[0]),
            'min-y': Number(viewBox[1]),
            width: Number(viewBox[2]),
            height: Number(viewBox[3]),
        };
    }

    png(options = {}) {
        this.options.update('png', options);
        options = this.options.get('png');
        this.output.format = formats.png;
        return this;
    }

    toBuffer(callback) {
        if (
            is.defined(callback) &&
            !is.fn(callback) &&
            callback !== undefined
        ) {
            throw error.invalidParameterError('callback', 'function', callback);
        }
        return this.processor.pipeline(callback);
    }

    toUri(options = {}, callback) {
        if (arguments.length === 1 && is.fn(options)) {
            callback = options;
        } else {
            this.options.update('uri', options);
        }
        options = this.options.get('uri');
        var mime = options.mime;
        var base64 = options.base64;
        var svg = this.html;
        var dimensions = this.svg.dimensions();
        const encoded = encodeURIComponent(svg)
            .replace(/'/g, '%27')
            .replace(/"/g, '%22');
        const header = 'data:image/svg+xml,';
        const encodedHeader = header + encoded;
        return new Promise(async (resolve, reject) => {
            var canvas = await createCanvas(
                dimensions.width,
                dimensions.height
            );
            var ctx = await canvas.getContext('2d');
            var im = await loadImage(encodedHeader, canvas);

            await ctx.drawImage(im, 0, 0);

            var uri = await canvas.toDataURL(mime);
            await close();

            if (base64) {
                uri = uri.replace(new RegExp(`^data:${mime};base64,`), '');
            }
            resolve(uri);
        });
    }

    toOriginal(outerHTML) {
        var element = this.toElement(outerHTML);
        this.resetAttributes(element, this.original.attributes);

        var originalPath = this.getFirstPathElement(this.original.element);
        if (originalPath) {
            var path = this.getFirstPathElement(element);
            this.resetAttributes(path, this.getAttributes(originalPath));
        }

        return element.outerHTML;
    }

    async process() {
        var element = this.checkFillState(this.resized.element.cloneNode(true));
        if (!element.getAttribute('viewBox')) {
            element.setAttribute(
                'viewBox',
                `0 0 ${this.original.dimensions.width} ${this.original.dimensions.height}`
            );
        }

        this.html = element.outerHTML;
        var png = this.png({ transparent: false });
        var buffer = await png.toBuffer();
        var traced = await Potrace(buffer, { svgSize: this.scale }).trace();

        const svg = this.toOriginal(traced);
        return svg;
    }
}

module.exports = Svg;
//new Svg(entries).process();

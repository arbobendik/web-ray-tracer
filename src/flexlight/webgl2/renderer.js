'use strict';

import { Math } from '../legacy/math.js';
export class GLLib {

  static postVertex = `#version 300 es
  in vec2 position2d;
  // Pass clip space position to fragment shader
  out vec2 clipSpace;
  void main() {
    vec2 pos = position2d * 2.0 - 1.0;
    // Set final clip space position
    gl_Position = vec4(pos, 0, 1);
    clipSpace = position2d;
  }
  `;

  static computeVertex = `#version 300 es
  in vec4 position;
  void main() {
    gl_Position = position;
  }`;

  static addCompileTimeConstant = (shaderSrc, name, value) => {
    // Remove version header
    let newSrc = shaderSrc.slice(15);
    // Add version header with new constant.
    return `#version 300 es
    #define ` + name + ` ` + value + `
    ` + newSrc;
  }

  static compile = (gl, vertex, fragment) => {
    var shaders = [
      { source: vertex, type: gl.VERTEX_SHADER },
      { source: fragment, type: gl.FRAGMENT_SHADER }
    ];
    // Create Program, compile and append vertex and fragment shader to it.
    let program = gl.createProgram();
    // Compile GLSL shaders.
    shaders.forEach(async (item, i) => {
      let shader = gl.createShader(item.type);
      gl.shaderSource(shader, item.source);
      gl.compileShader(shader);
      // Append shader to Program if GLSL compiled successfully.
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.attachShader(program, shader);
      } else {
        // Log debug info and delete shader if shader fails to compile.
        console.warn(gl.getShaderInfoLog(shader));
        console.log(item.source);
        gl.deleteShader(shader);
      }
    });

    gl.linkProgram(program);
    // Return program if it links successfully.
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      // Log debug info and delete Program if Program fails to link.
      console.warn(gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
    } else {
      return program;
    }
  };
  
  static setTexParams = (gl) => {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  };

  static setByteTexture = (gl, array, width, height) => {
    let tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, array);
    GLLib.setTexParams(gl);
    return tex;
  };

  // Convert 4 bytes, texture channels to usable float.
  static toFloat = (bytes) => (bytes[0] + bytes[1] / 255 + bytes[2] / 65025 + bytes[3] / 16581375) * 2 - 255;

  // Split float into 4 8-bit texture channels.
  static toBytes = (num) => {
    let f = (num + 255) / 2;
    let bytes = [f, f * 255, f * 65025, f * 16581375];
    // Use modulo that the sum of all bytes is num.
    return bytes.map((item, i) => bytes[i] = Math.floor(Math.mod(item, 255)));
  };
}
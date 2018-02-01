"use strict";

var vertexShaderSource = `#version 300 es

// an attribute is an input (in) to a vertex shader.
// It will receive data from a buffer
in vec4 a_position;
out vec2 position;

// all shaders have a main function
void main() {
  // Pass the position
  gl_Position = a_position;
  position = a_position.xy; 
}`;

var fancyFragmentShaderSource = `#version 300 es

precision mediump float;

in vec2 position; 

// The texture.
uniform sampler2D u_previousFrame;

// Geometry info.
uniform vec2 u_deformers[3];
uniform vec2 u_triangleCoords[3];

// we need to declare an output for the fragment shader
out vec4 outColor;

void main() {
  vec2 shift = vec2(0,0);
  vec2 frag = vec2(gl_FragCoord.xy);
  vec2 difference; 
  float squareDistance; 

  for(int i = 0; i < 3; i++){
    difference = u_deformers[i] - frag; 
    shift += difference / (difference.x * difference.x + difference.y * difference.y + 1.0f);
  }

  shift *= 0.01;

  outColor = texture(u_previousFrame, (frag + shift + vec2(1,1)) * 0.5f);
}`;

var postProcessFragmentShaderSource = `#version 300 es

precision mediump float; 

in vec2 position; 

// The texture.
uniform sampler2D u_currentFrame;

// we need to declare an output for the fragment shader
out vec4 fragColor;

void main()
{
    // fragColor = texture(u_currentFrame, (gl_FragCoord.xy + vec2(1,1)) * 0.5f);
    fragColor = vec4((position.x + 1.0) * 0.5 ,1,0,1);
}`;

function main() {
  // Get A WebGL context
  /** @type {HTMLCanvasElement} */
  var canvas = document.getElementById("canvas");
  var gl = canvas.getContext("webgl2");
  if (!gl) {
    console.error("could not get webgl2 content");
    document.body.textContent = "Your browser does not allow us to set up webgl2 :-/";
    return;
  }

  // Use our boilerplate utils to compile the shaders and link into a program
  var fancyProgram = createProgramFromSources(gl,
      [vertexShaderSource, fancyFragmentShaderSource]);

  // look up where the vertex data needs to go.
  var positionAttributeLocation = 0;
  gl.bindAttribLocation(fancyProgram, positionAttributeLocation, "a_position");

  // look up uniform locations
  var previousFrameTextureLocation = gl.getUniformLocation(fancyProgram, "u_previousFrame");
  var deformersLocation = gl.getUniformLocation(fancyProgram, "u_deformers");
  var triangleCoordsLocation = gl.getUniformLocation(fancyProgram, "u_triangleCoords");

  // For rendering the frame texture to the screen
  var postProcessProgram = createProgramFromSources(gl, 
      [vertexShaderSource, postProcessFragmentShaderSource]);

  gl.bindAttribLocation(postProcessProgram, positionAttributeLocation, "a_position");

  var currentFrameTextureLocation = gl.getUniformLocation(postProcessProgram, "u_currentFrame");

  // Create a buffer
  var positionBuffer = gl.createBuffer();

  // Create a vertex array object (attribute state)
  var vao = gl.createVertexArray();

  // and make it the one we're currently working with
  gl.bindVertexArray(vao);

  // Turn on the attribute
  gl.enableVertexAttribArray(positionAttributeLocation);

  // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  var positions = [
    -1,-1,
     1,-1,
    -1, 1, 
     1, 1
  ];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);  

  // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
  var size = 2;          // 2 components per iteration
  var type = gl.FLOAT;   // the data is 32bit floats
  var normalize = false; // don't normalize the data
  var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
  var offset = 0;        // start at the beginning of the buffer
  gl.vertexAttribPointer(
      positionAttributeLocation, size, type, normalize, stride, offset);

  /*// Create two textures, they get switched after every frame - one to read from, one to write to
  const frameWidth = 512;
  const frameHeight = 512;
  const frame = [];
  for(var i = 0; i <= 1; i++){
    frame[i] = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, frame[i]);


    // define size and format of level 0
    const level = 0;
    const internalFormat = gl.RGBA;
    const border = 0;
    const format = gl.RGBA;
    const type = gl.UNSIGNED_BYTE;
    const data = null;
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                  frameWidth, frameHeight, border,
                  format, type, data);

    // set the filtering so we don't need mips
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  // Create and bind the framebuffer
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);*/

  // Get the starting time.
  var then = 0;

  var previousFrameIndex = 0;


  requestAnimationFrame(drawScene);

  // Draw the scene.
  function drawScene(time) {
    // convert to seconds
    time *= 0.001;
    // Subtract the previous time from the current time
    var deltaTime = time - then;
    // Remember the current time for the next frame.
    then = time;

    var currentFrameIndex = 1 - previousFrameIndex;

    /*{
      //set render target
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); // we need some kind of internal double buffering - because we read from the previous frame and write the next frame
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, frame[currentFrameIndex], 0); //level = 0
      
      //set texture to write to
      gl.bindTexture(gl.TEXTURE_2D, frame[previousFrameIndex]);
      
      gl.useProgram(fancyProgram); 



      gl.uniform1i(previousFrameTextureLocation, 0); //maybe this is only necessary initially
      var deformers = [
        0,0,
        0,1,
        1,1
      ];
      gl.uniform2fv(deformersLocation, deformers)
      gl.uniform2fv(triangleCoordsLocation, Array.apply(null, Array(6)).map(i => (Math.random()*2-1)))

      gl.bindVertexArray(vao); 
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }*/
    {
      //set render target
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); //Screen
      /*
      //set texture to read from
      gl.bindTexture(gl.TEXTURE_2D, frame[currentFrameIndex]);
*/

//      gl.viewport(-1, -1, 2, 2); //redundant probably
  gl.viewport(0, 0, 512, 512);

  
      gl.clearColor(0, 0, 1, 1);   // clear to blue
      gl.clear(gl.COLOR_BUFFER_BIT);

      //set program and uniforms
      gl.useProgram(postProcessProgram);
      gl.uniform1i(currentFrameTextureLocation, 0);

      gl.bindVertexArray(vao); 
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    requestAnimationFrame(drawScene);
  }
}

main();

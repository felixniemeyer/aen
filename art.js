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
uniform vec3 u_touches[10];
uniform int u_touchCount; 

uniform vec2 u_triangleCoords[3];
uniform int u_drawTriangle;

float onePixel = 2.0 / 1024.0;

// we need to declare an output for the fragment shader
out vec4 outColor;

void main() {

	int i; 
	bool partOfTriangle = false;
	float a, b = -1.0, edgeDistance; 
	if(u_drawTriangle == 1)
	{
		vec2 avg = ( ( u_triangleCoords[0] + u_triangleCoords[1] ) * 0.5 + u_triangleCoords[2] ) * 0.5;

		int iB, iC; 
		float M, U, N, V; 
		for(i = 0; i < 3; i++)
		{
			iB = i; 
			iC = (i + 1) % 3; 

			M = (u_triangleCoords[iB].y - u_triangleCoords[iC].y) * (position.x - avg.x);
			U = (position.x - avg.x) * (u_triangleCoords[iC].y - avg.y);
			N = (u_triangleCoords[iB].x - u_triangleCoords[iC].x) * (position.y - avg.y);
			V = (position.y - avg.y) * (u_triangleCoords[iC].x - avg.x); 

			a = (V-U) / (M - N);

			b = ( position.y - avg.y ) / ( u_triangleCoords[iB].y * a + u_triangleCoords[iC].y * (1.0 - a) - avg.y);

			if(a >= 0.0 && a <= 1.0 && b >= 0.0 && b <= 1.0)
			{
				partOfTriangle = true; 
				edgeDistance = distance(avg, position) / b;
				break; 
			}
		} 
	}

	vec4 previousColor = texture(u_previousFrame, (position + vec2(1,1)) * 0.5f);
	vec4 invertColor = vec4(min(1.0, 0.1 + previousColor.g*0.9 + abs(previousColor.b*0.5 - previousColor.r)), abs((previousColor.b+0.15) * previousColor.r), 0.1 + 0.9*previousColor.r, previousColor.a);
	float fade; 
	if(partOfTriangle)
	{
		vec4 newColor = vec4(1,1,1,1)*0.65 + vec4((u_triangleCoords[0].xy + vec2(2,2)) * 0.33, 0.75, 1)*0.35;
		float relPixSize = onePixel * 2.0 / (edgeDistance); 
		if(b <= 0.9)
		{

			if(b > 0.9 - relPixSize)
			{
				fade = (0.9-b) / relPixSize;
				outColor = invertColor * fade + newColor * (1.0 - fade); 
			}
			else
			{
				outColor = invertColor; 
			}
		}
		else if(b <= 1.0)
		{
			if(b > 1.0 - relPixSize)
			{
				fade = (1.0-b) / relPixSize;
				outColor = newColor * fade + previousColor * (1.0 - fade);
			}
			else
			{
				outColor = newColor; 
			}
		}
	}
	else 
	{
		vec2 shift = vec2(0,0);
		vec2 difference;
		float distance;  
		float speed = 0.0018; 

		for(i = 0; i < 3; i++){
			difference = u_deformers[i] - position; 
			distance = pow(difference.x, 2.0) + pow(difference.y, 2.0);
			shift += difference / (distance+speed) / pow(distance+1.0,1.5);
		}

		for(i = 0; i < u_touchCount; i++){
			difference = u_touches[i].xy - position;
			distance = pow(difference.x, 2.0) + pow(difference.y, 2.0);
			shift -= 2.0 * difference / (distance+speed) / pow(distance+1.0,1.5);
		}

		shift *= speed; //consider multiplying with -1 :D

		outColor = texture(u_previousFrame, (position + shift + vec2(1,1)) * 0.5f)*vec4(0.992,0.994,0.996,1) - vec4(0.00055,0.00015,0.00025,0);
	}
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
	fragColor = texture(u_currentFrame, (position + vec2(1,1)) * 0.5f);
}`;

var keydown = false; 
var touches = [];

function initEventListeners()
{
	window.addEventListener("keydown", () => { keydown = true });
	window.addEventListener("keyup", () => { keydown = false });
	window.addEventListener("blur", () => { keydown = false });

	document.body.addEventListener("touchestart", updateTouches, {passive: false}); 
	document.body.addEventListener("touchmove", updateTouches, {passive: false});
	document.body.addEventListener("touchend", updateTouches, {passive: false});
}

//gibt es eigentlich eine js sound library? lol.

function updateTouches(evt) {
	evt.preventDefault();
	evt.stopPropagation();
	
	var width = window.innerWidth; 
	var height = window.innerHeight; 

	touches = [];
	for(var i = 0; i < evt.touches.length; i++) {	
		touches.push([
			evt.touches[i].pageX * 2 / width - 1,
			-evt.touches[i].pageY * 2 / height + 1, 
			1
		]);
	}
}

function getTouchesForUniform(time, gl){
	var uniformIndex, touchesForUniform = [];
	for(var touchIndex = 0; touchIndex < 10; touchIndex++) {
		for(var componentIndex = 0; componentIndex < 3; componentIndex++) {
			uniformIndex = touchIndex * 3 + componentIndex; 
			touchesForUniform[uniformIndex] = touchIndex < touches.length ? touches[touchIndex][componentIndex] : 0;
		}
	}
	return touchesForUniform;
}

function main() {
	initEventListeners();

	// Get A WebGL context
	/** @type {HTMLCanvasElement} */
	var canvas = document.getElementById("canvas");
	var gl = canvas.getContext("webgl2");
	if (!gl) {
		console.error("could not get webgl2 content");
		document.body.textContent = "Your browser does not allow us to set up webgl2 :-/";
		return;
	}

	//extensions
	var ext = gl.getExtension('EXT_color_buffer_float');
	if (!ext) {
		console.error("need gl extension EXT_color_buffer_float");
		return; 
	}

	var texsize = Math.pow(2,10);
	var cansize = texsize;//1024;  

	canvas.setAttribute("width", cansize);
	canvas.setAttribute("height", cansize);

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
	var drawTriangleLocation = gl.getUniformLocation(fancyProgram, "u_drawTriangle");
	var touchesLocation = gl.getUniformLocation(fancyProgram, "u_touches");
	var touchCountLocation = gl.getUniformLocation(fancyProgram, "u_touchCount");

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

	// Create two textures, they get switched after every frame - one to read from, one to write to
	const frameWidth = texsize;
	const frameHeight = texsize;
	const frame = [];
	for(var i = 0; i <= 1; i++){
		frame[i] = gl.createTexture();
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, frame[i]);


		// define size and format of level 0
		const level = 0;
		const internalFormat = gl.RGBA16F;
		const border = 0;
		const format = gl.RGBA;
		const type = gl.HALF_FLOAT;
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
	gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

	// Get the starting time.
	var then = 0;

	var currentFrameIndex = 0;
	var triangleInterval = 280;
	var timeSinceLastTriangle = triangleInterval, justDrewATriangle = false; 

	requestAnimationFrame(drawScene);

	// Draw the scene.
	function drawScene(time) {
		var deltaTime = time - then;
		then = time;

		timeSinceLastTriangle += deltaTime;

		currentFrameIndex = 1 - currentFrameIndex;
		var previousFrameIndex = 1 - currentFrameIndex;

		{
			//set render target
			gl.bindFramebuffer(gl.FRAMEBUFFER, fb); // we need some kind of internal double buffering - because we read from the previous frame and write the next frame
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, frame[currentFrameIndex], 0); //level = 0

			//set texture to write to
			gl.bindTexture(gl.TEXTURE_2D, frame[previousFrameIndex]);

			gl.viewport(0, 0, texsize, texsize);

			gl.useProgram(fancyProgram); 


			if(justDrewATriangle)
			{
				gl.uniform1i(drawTriangleLocation, 0);
				justDrewATriangle = false; 
			} 
			timeSinceLastTriangle += deltaTime;
			if(timeSinceLastTriangle >= triangleInterval || keydown)
			{
				gl.uniform2fv(triangleCoordsLocation, Array.apply(null, Array(6)).map(i => (Math.random()*2-1)))        
					gl.uniform1i(drawTriangleLocation, 1);
				timeSinceLastTriangle = Math.min(triangleInterval, Math.max(0, timeSinceLastTriangle - triangleInterval * (Math.random()*1.8-0.4))); 
				justDrewATriangle = true; 
			}

			gl.uniform1i(previousFrameTextureLocation, 0); //maybe this is only necessary initially
			var deformers = [
				Math.sin(time*0.0001), Math.sin(time*0.00031 + 3),
				Math.sin(time*0.00012+1), Math.sin(time*0.000092+100),
				Math.sin(time*0.000235+0.543), Math.sin(time*0.0004+10)
			].map(x => x*0.9);
			gl.uniform2fv(deformersLocation, deformers)

			gl.uniform3fv(touchesLocation, getTouchesForUniform());
			gl.uniform1i(touchCountLocation, touches.length);

				gl.bindVertexArray(vao); 
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		}
		{
			//set render target
			gl.bindFramebuffer(gl.FRAMEBUFFER, null); //Screen

			//set texture to read from
			gl.bindTexture(gl.TEXTURE_2D, frame[currentFrameIndex]);

			gl.viewport(0, 0, cansize, cansize);


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

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

uniform float u_y_from;
uniform float u_y_to; 
uniform float u_scroll; 
uniform int u_drawRect;

const float speed = 0.0009; 

// we need to declare an output for the fragment shader
out vec4 outColor;

void main() {

	vec2 shift = vec2(0,0);
	vec2 difference;
	float distance;  
	
	int i;
	// deformers
	for(i = 0; i < 3; i++){
		difference = u_deformers[i] - position; 
		distance = pow(difference.x, 2.0) + pow(difference.y, 2.0);
		shift += difference / (distance+speed) / pow(distance+1.0,1.5);
	}

	// attractors
	for(i = 0; i < u_touchCount; i++){
		difference = u_touches[i].xy - position;
		distance = pow(difference.x, 2.0) + pow(difference.y, 2.0);
		shift -= 5.0 * difference / (distance+speed) / pow(distance+1.0,1.5);
	}

	shift *= speed; //consider multiplying with -1 :D
	shift.y -= u_scroll;

	vec3 previousColor = texture(u_previousFrame, (position + shift + vec2(1,1)) * 0.5f).rgb;
	vec3 nextColor;

	if(position.y > u_y_from && position.y < u_y_to ) {
		if(position.y > u_y_from * 0.9 + u_y_to * 0.1 && position.y < u_y_to * 0.9 + u_y_from * 0.1) {
			nextColor = previousColor - 0.006 * vec3(1, 1, 0.5) ; //0.33 * (vec3(1) + vec3(u_y_from, u_y_to, 0));
		} else {
			nextColor = previousColor - 0.01 * vec3(previousColor.g, previousColor.b, previousColor.r); 
		//	vec3(
		//		min(1.0, 0.1 + previousColor.g*0.9 + abs(previousColor.b*0.5 - previousColor.r)), 
		//		abs((previousColor.b+0.15) * previousColor.r), 
		//		0.1 + 0.9*previousColor.r
		//	);
		}
		nextColor = max(vec3(0), nextColor);
	} else {
		nextColor = min(vec3(1), previousColor * vec3(1.008, 1.0065, 1.004) + vec3(0.00055, 0.00025, 0.00015)); 
	}
	outColor = vec4(nextColor, 1); 
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
var previousScroll = 0;
var leftToScroll = 0;
var windowHeight = 0, windowWidth = 0;

var canvas = document.getElementById("canvas");

function updateWindowDim() {
	windowHeight = canvas.clientHeight; 
	windowWidth = canvas.clientWidth;
}
updateWindowDim()

function initEventListeners()
{
	window.addEventListener("keydown", () => { keydown = true });
	window.addEventListener("keyup", () => { keydown = false });
	window.addEventListener("blur", () => { keydown = false });

	window.addEventListener('resize', updateWindowDim);
	
	document.addEventListener("touchestart", updateTouches, {passive: false}); 
	document.addEventListener("touchmove", updateTouches, {passive: false});
	document.addEventListener("touchend", updateTouches, {passive: false});

	document.addEventListener("mousemove", e => {
		touches = [[
			e.clientX / windowWidth * 2 - 1, 
			- e.clientY / windowHeight * 2 + 1, 
			1
		]]
	});

	document.addEventListener('scroll', e => {
		leftToScroll += window.scrollY - previousScroll;
		previousScroll = window.scrollY;
	})
}

//gibt es eigentlich eine js sound library? lol. (paar Jahre später: Antwort = ja, Web Audio)

function updateTouches(evt) {
	evt.preventDefault();
	evt.stopPropagation();
	
	touches = [];
	for(var i = 0; i < evt.touches.length; i++) {	
		touches.push([
			evt.touches[i].pageX * 2 / windowWidth - 1,
			-evt.touches[i].pageY * 2 / windowHeight + 1, 
			1
		]);
	}
}

function getTouchesForUniform(){
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

	var texsize = Math.pow(2, 8);
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
	var yFromLocation= gl.getUniformLocation(fancyProgram, "u_y_from");
	var yToLocation = gl.getUniformLocation(fancyProgram, "u_y_to");
	var scrollLocation = gl.getUniformLocation(fancyProgram, "u_scroll");
	var drawRectLocation = gl.getUniformLocation(fancyProgram, "u_drawRect");
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
	var rectInterval = 4870;
	var timeSinceLastRect = rectInterval, justDrewARect = false; 
	
	let  firstFrameEver = true; 

	requestAnimationFrame(drawScene);

	// Draw the scene.
	function drawScene(time) {
		var deltaTime = time - then;
		then = time;

		timeSinceLastRect += deltaTime;

		currentFrameIndex = 1 - currentFrameIndex;
		var previousFrameIndex = 1 - currentFrameIndex;

		{
			//set render target
			gl.bindFramebuffer(gl.FRAMEBUFFER, fb); // we need some kind of internal double buffering - because we read from the previous frame and write the next frame
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, frame[currentFrameIndex], 0); //level = 0
			if(firstFrameEver) {
				gl.clearColor(1, 1, 1, 1);   // clear to blue
				gl.clear(gl.COLOR_BUFFER_BIT);
				firstFrameEver = false;
			} else {
				//set texture to write to
				gl.bindTexture(gl.TEXTURE_2D, frame[previousFrameIndex]);

				gl.viewport(0, 0, texsize, texsize);

				gl.useProgram(fancyProgram); 


				if(justDrewARect)
				{
					gl.uniform1i(drawRectLocation, 0);
					justDrewARect = false; 
				} 
				timeSinceLastRect += deltaTime;
				if(timeSinceLastRect >= rectInterval || keydown)
				{
					const height = Math.random() * Math.random();
					const yFrom = Math.random() * (2 - height) - 1; 
					gl.uniform1f(yFromLocation, yFrom); 
					gl.uniform1f(yToLocation, yFrom + height); 
					gl.uniform1i(drawRectLocation, 1);
					timeSinceLastRect = Math.min(rectInterval, Math.max(0, timeSinceLastRect - rectInterval * (Math.random()*1.8-0.4))); 
					justDrewARect = true; 
				}

				gl.uniform1i(previousFrameTextureLocation, 0); //maybe this is only necessary initially
				var deformers = [
					Math.sin(time*0.00005), Math.sin(time*0.00011 + 3),
					Math.sin(time*0.00006+1), Math.sin(time*0.0000452+100),
					Math.sin(time*0.000135+0.543), Math.sin(time*0.0002+10)
				].map(x => x*0.9);
				gl.uniform2fv(deformersLocation, deformers)

				gl.uniform1f(scrollLocation, (leftToScroll / windowHeight) * 2);
				leftToScroll = 0;

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


				//set program and uniforms
				gl.useProgram(postProcessProgram);
				gl.uniform1i(currentFrameTextureLocation, 0);

				gl.bindVertexArray(vao); 
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			}
		}
		setTimeout(() => {
			requestAnimationFrame(drawScene);
		}, 1000 / 49)
	}
}

main();

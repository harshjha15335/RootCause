import{M as ot,O as vs,k as ee,F as se,l as Ut,U as Vt,V as Z,W as ue,H as pe,N as ws,C as Ss,m as Ms,n as Ts,o as Es,L as Ps,q as Cs,t as ks,A as os,v as Ds,w as As,x as At,y as U,z as Wt,D as bt,S as Ls,u as Rs,E as Ns,G as Yt,T as Ht,Q as We,I as Ye,J as Os,P as js,K as as,X as Us,Y as ke,Z as Gt,_ as zs,$ as Le,a0 as ns,a1 as fe,a2 as me,a3 as oe,a4 as Bs,a5 as Fs,a6 as Is,a7 as Hs,a8 as Gs,a9 as rs,aa as Ws,ab as Re,ac as ls,ad as Ne,ae as Oe,af as zt,ag as Xt,ah as Ys,ai as ge,aj as Xs,ak as be,al as cs,am as Vs,an as Ks,ao as $s,ap as re,aq as Xe,ar as Zs,as as Qs,at as qs,a as hs,au as Js,r as it,j as v,i as ti,av as ei}from"./index-BCHSA0MJ.js";const ds={name:"CopyShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`};class Jt{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error("THREE.Pass: .render() must be implemented in derived pass.")}dispose(){}}const si=new vs(-1,1,1,-1,0,1);class ii extends ee{constructor(){super(),this.setAttribute("position",new se([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute("uv",new se([0,2,0,0,2,0],2))}}const oi=new ii;class je{constructor(t){this._mesh=new ot(oi,t)}dispose(){this._mesh.geometry.dispose()}render(t){t.render(this._mesh,si)}get material(){return this._mesh.material}set material(t){this._mesh.material=t}}class ai extends Jt{constructor(t,e){super(),this.textureID=e!==void 0?e:"tDiffuse",t instanceof Ut?(this.uniforms=t.uniforms,this.material=t):t&&(this.uniforms=Vt.clone(t.uniforms),this.material=new Ut({name:t.name!==void 0?t.name:"unspecified",defines:Object.assign({},t.defines),uniforms:this.uniforms,vertexShader:t.vertexShader,fragmentShader:t.fragmentShader})),this.fsQuad=new je(this.material)}render(t,e,o){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=o.texture),this.fsQuad.material=this.material,this.renderToScreen?(t.setRenderTarget(null),this.fsQuad.render(t)):(t.setRenderTarget(e),this.clear&&t.clear(t.autoClearColor,t.autoClearDepth,t.autoClearStencil),this.fsQuad.render(t))}dispose(){this.material.dispose(),this.fsQuad.dispose()}}class Ve extends Jt{constructor(t,e){super(),this.scene=t,this.camera=e,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(t,e,o){const i=t.getContext(),a=t.state;a.buffers.color.setMask(!1),a.buffers.depth.setMask(!1),a.buffers.color.setLocked(!0),a.buffers.depth.setLocked(!0);let n,r;this.inverse?(n=0,r=1):(n=1,r=0),a.buffers.stencil.setTest(!0),a.buffers.stencil.setOp(i.REPLACE,i.REPLACE,i.REPLACE),a.buffers.stencil.setFunc(i.ALWAYS,n,4294967295),a.buffers.stencil.setClear(r),a.buffers.stencil.setLocked(!0),t.setRenderTarget(o),this.clear&&t.clear(),t.render(this.scene,this.camera),t.setRenderTarget(e),this.clear&&t.clear(),t.render(this.scene,this.camera),a.buffers.color.setLocked(!1),a.buffers.depth.setLocked(!1),a.buffers.color.setMask(!0),a.buffers.depth.setMask(!0),a.buffers.stencil.setLocked(!1),a.buffers.stencil.setFunc(i.EQUAL,1,4294967295),a.buffers.stencil.setOp(i.KEEP,i.KEEP,i.KEEP),a.buffers.stencil.setLocked(!0)}}class ni extends Jt{constructor(){super(),this.needsSwap=!1}render(t){t.state.buffers.stencil.setLocked(!1),t.state.buffers.stencil.setTest(!1)}}class ri{constructor(t,e){if(this.renderer=t,this._pixelRatio=t.getPixelRatio(),e===void 0){const o=t.getSize(new Z);this._width=o.width,this._height=o.height,e=new ue(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:pe}),e.texture.name="EffectComposer.rt1"}else this._width=e.width,this._height=e.height;this.renderTarget1=e,this.renderTarget2=e.clone(),this.renderTarget2.texture.name="EffectComposer.rt2",this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new ai(ds),this.copyPass.material.blending=ws,this.clock=new Ss}swapBuffers(){const t=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=t}addPass(t){this.passes.push(t),t.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(t,e){this.passes.splice(e,0,t),t.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(t){const e=this.passes.indexOf(t);e!==-1&&this.passes.splice(e,1)}isLastEnabledPass(t){for(let e=t+1;e<this.passes.length;e++)if(this.passes[e].enabled)return!1;return!0}render(t){t===void 0&&(t=this.clock.getDelta());const e=this.renderer.getRenderTarget();let o=!1;for(let i=0,a=this.passes.length;i<a;i++){const n=this.passes[i];if(n.enabled!==!1){if(n.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(i),n.render(this.renderer,this.writeBuffer,this.readBuffer,t,o),n.needsSwap){if(o){const r=this.renderer.getContext(),l=this.renderer.state.buffers.stencil;l.setFunc(r.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,t),l.setFunc(r.EQUAL,1,4294967295)}this.swapBuffers()}Ve!==void 0&&(n instanceof Ve?o=!0:n instanceof ni&&(o=!1))}}this.renderer.setRenderTarget(e)}reset(t){if(t===void 0){const e=this.renderer.getSize(new Z);this._pixelRatio=this.renderer.getPixelRatio(),this._width=e.width,this._height=e.height,t=this.renderTarget1.clone(),t.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=t,this.renderTarget2=t.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(t,e){this._width=t,this._height=e;const o=this._width*this._pixelRatio,i=this._height*this._pixelRatio;this.renderTarget1.setSize(o,i),this.renderTarget2.setSize(o,i);for(let a=0;a<this.passes.length;a++)this.passes[a].setSize(o,i)}setPixelRatio(t){this._pixelRatio=t,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}}const li={name:"OutputShader",uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`
	
		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`};class ci extends Jt{constructor(){super();const t=li;this.uniforms=Vt.clone(t.uniforms),this.material=new Ms({name:t.name,uniforms:this.uniforms,vertexShader:t.vertexShader,fragmentShader:t.fragmentShader}),this.fsQuad=new je(this.material),this._outputColorSpace=null,this._toneMapping=null}render(t,e,o){this.uniforms.tDiffuse.value=o.texture,this.uniforms.toneMappingExposure.value=t.toneMappingExposure,(this._outputColorSpace!==t.outputColorSpace||this._toneMapping!==t.toneMapping)&&(this._outputColorSpace=t.outputColorSpace,this._toneMapping=t.toneMapping,this.material.defines={},Ts.getTransfer(this._outputColorSpace)===Es&&(this.material.defines.SRGB_TRANSFER=""),this._toneMapping===Ps?this.material.defines.LINEAR_TONE_MAPPING="":this._toneMapping===Cs?this.material.defines.REINHARD_TONE_MAPPING="":this._toneMapping===ks?this.material.defines.CINEON_TONE_MAPPING="":this._toneMapping===os?this.material.defines.ACES_FILMIC_TONE_MAPPING="":this._toneMapping===Ds?this.material.defines.AGX_TONE_MAPPING="":this._toneMapping===As&&(this.material.defines.NEUTRAL_TONE_MAPPING=""),this.material.needsUpdate=!0),this.renderToScreen===!0?(t.setRenderTarget(null),this.fsQuad.render(t)):(t.setRenderTarget(e),this.clear&&t.clear(t.autoClearColor,t.autoClearDepth,t.autoClearStencil),this.fsQuad.render(t))}dispose(){this.material.dispose(),this.fsQuad.dispose()}}class hi extends Jt{constructor(t,e,o=null,i=null,a=null){super(),this.scene=t,this.camera=e,this.overrideMaterial=o,this.clearColor=i,this.clearAlpha=a,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this._oldClearColor=new At}render(t,e,o){const i=t.autoClear;t.autoClear=!1;let a,n;this.overrideMaterial!==null&&(n=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(t.getClearColor(this._oldClearColor),t.setClearColor(this.clearColor,t.getClearAlpha())),this.clearAlpha!==null&&(a=t.getClearAlpha(),t.setClearAlpha(this.clearAlpha)),this.clearDepth==!0&&t.clearDepth(),t.setRenderTarget(this.renderToScreen?null:o),this.clear===!0&&t.clear(t.autoClearColor,t.autoClearDepth,t.autoClearStencil),t.render(this.scene,this.camera),this.clearColor!==null&&t.setClearColor(this._oldClearColor),this.clearAlpha!==null&&t.setClearAlpha(a),this.overrideMaterial!==null&&(this.scene.overrideMaterial=n),t.autoClear=i}}const di={uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new At(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`};class Kt extends Jt{constructor(t,e,o,i){super(),this.strength=e!==void 0?e:1,this.radius=o,this.threshold=i,this.resolution=t!==void 0?new Z(t.x,t.y):new Z(256,256),this.clearColor=new At(0,0,0),this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let a=Math.round(this.resolution.x/2),n=Math.round(this.resolution.y/2);this.renderTargetBright=new ue(a,n,{type:pe}),this.renderTargetBright.texture.name="UnrealBloomPass.bright",this.renderTargetBright.texture.generateMipmaps=!1;for(let c=0;c<this.nMips;c++){const w=new ue(a,n,{type:pe});w.texture.name="UnrealBloomPass.h"+c,w.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(w);const g=new ue(a,n,{type:pe});g.texture.name="UnrealBloomPass.v"+c,g.texture.generateMipmaps=!1,this.renderTargetsVertical.push(g),a=Math.round(a/2),n=Math.round(n/2)}const r=di;this.highPassUniforms=Vt.clone(r.uniforms),this.highPassUniforms.luminosityThreshold.value=i,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new Ut({uniforms:this.highPassUniforms,vertexShader:r.vertexShader,fragmentShader:r.fragmentShader}),this.separableBlurMaterials=[];const l=[3,5,7,9,11];a=Math.round(this.resolution.x/2),n=Math.round(this.resolution.y/2);for(let c=0;c<this.nMips;c++)this.separableBlurMaterials.push(this.getSeperableBlurMaterial(l[c])),this.separableBlurMaterials[c].uniforms.invSize.value=new Z(1/a,1/n),a=Math.round(a/2),n=Math.round(n/2);this.compositeMaterial=this.getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=e,this.compositeMaterial.uniforms.bloomRadius.value=.1;const d=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=d,this.bloomTintColors=[new U(1,1,1),new U(1,1,1),new U(1,1,1),new U(1,1,1),new U(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors;const f=ds;this.copyUniforms=Vt.clone(f.uniforms),this.blendMaterial=new Ut({uniforms:this.copyUniforms,vertexShader:f.vertexShader,fragmentShader:f.fragmentShader,blending:Wt,depthTest:!1,depthWrite:!1,transparent:!0}),this.enabled=!0,this.needsSwap=!1,this._oldClearColor=new At,this.oldClearAlpha=1,this.basic=new bt,this.fsQuad=new je(null)}dispose(){for(let t=0;t<this.renderTargetsHorizontal.length;t++)this.renderTargetsHorizontal[t].dispose();for(let t=0;t<this.renderTargetsVertical.length;t++)this.renderTargetsVertical[t].dispose();this.renderTargetBright.dispose();for(let t=0;t<this.separableBlurMaterials.length;t++)this.separableBlurMaterials[t].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this.basic.dispose(),this.fsQuad.dispose()}setSize(t,e){let o=Math.round(t/2),i=Math.round(e/2);this.renderTargetBright.setSize(o,i);for(let a=0;a<this.nMips;a++)this.renderTargetsHorizontal[a].setSize(o,i),this.renderTargetsVertical[a].setSize(o,i),this.separableBlurMaterials[a].uniforms.invSize.value=new Z(1/o,1/i),o=Math.round(o/2),i=Math.round(i/2)}render(t,e,o,i,a){t.getClearColor(this._oldClearColor),this.oldClearAlpha=t.getClearAlpha();const n=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),a&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this.fsQuad.material=this.basic,this.basic.map=o.texture,t.setRenderTarget(null),t.clear(),this.fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=o.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this.fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this.fsQuad.render(t);let r=this.renderTargetBright;for(let l=0;l<this.nMips;l++)this.fsQuad.material=this.separableBlurMaterials[l],this.separableBlurMaterials[l].uniforms.colorTexture.value=r.texture,this.separableBlurMaterials[l].uniforms.direction.value=Kt.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[l]),t.clear(),this.fsQuad.render(t),this.separableBlurMaterials[l].uniforms.colorTexture.value=this.renderTargetsHorizontal[l].texture,this.separableBlurMaterials[l].uniforms.direction.value=Kt.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[l]),t.clear(),this.fsQuad.render(t),r=this.renderTargetsVertical[l];this.fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this.fsQuad.render(t),this.fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this.fsQuad.render(t)):(t.setRenderTarget(o),this.fsQuad.render(t)),t.setClearColor(this._oldClearColor,this.oldClearAlpha),t.autoClear=n}getSeperableBlurMaterial(t){const e=[];for(let o=0;o<t;o++)e.push(.39894*Math.exp(-.5*o*o/(t*t))/t);return new Ut({defines:{KERNEL_RADIUS:t},uniforms:{colorTexture:{value:null},invSize:{value:new Z(.5,.5)},direction:{value:new Z(.5,.5)},gaussianCoefficients:{value:e}},vertexShader:`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`#include <common>
				varying vec2 vUv;
				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float gaussianCoefficients[KERNEL_RADIUS];

				void main() {
					float weightSum = gaussianCoefficients[0];
					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * weightSum;
					for( int i = 1; i < KERNEL_RADIUS; i ++ ) {
						float x = float(i);
						float w = gaussianCoefficients[i];
						vec2 uvOffset = direction * invSize * x;
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += (sample1 + sample2) * w;
						weightSum += 2.0 * w;
					}
					gl_FragColor = vec4(diffuseSum/weightSum, 1.0);
				}`})}getCompositeMaterial(t){return new Ut({defines:{NUM_MIPS:t},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`varying vec2 vUv;
				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor(const in float factor) {
					float mirrorFactor = 1.2 - factor;
					return mix(factor, mirrorFactor, bloomRadius);
				}

				void main() {
					gl_FragColor = bloomStrength * ( lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +
						lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +
						lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +
						lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +
						lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv) );
				}`})}}Kt.BlurDirectionX=new Z(1,0);Kt.BlurDirectionY=new Z(0,1);const us=105,ui=68,Nt=5400,Rt=49,xe=(s,t)=>t===1?s:us-s,De=(s,t)=>t===1?s:ui-s;function we(s,t){return s.raw[Math.min(Math.max(Math.floor(t),0),Nt-1)*Rt+48]||1}function Et(s,t){const e=Math.min(Math.max(Math.floor(t),0),Nt-1),o=Math.min(Math.max(t-e,0),1),i=s.raw,a=i[e*Rt+48]||1,n=C=>{const S=Math.min(Math.max(C,0),Nt-1);return(i[S*Rt+48]||1)===a?S:e},r=n(e-1),l=n(e+1),d=n(e+2),f=(C,S)=>xe(i[C*Rt+S]/10,a),c=(C,S)=>De(i[C*Rt+S+1]/10,a),w=(C,S,k,M)=>.5*(2*S+(-C+k)*o+(2*C-5*S+4*k-M)*o*o+(-C+3*S-3*k+M)*o*o*o),g=(C,S,k,M)=>.5*(-C+k+2*(2*C-5*S+4*k-M)*o+3*(-C+3*S-3*k+M)*o*o),Q=[],N=[];for(let C=0;C<22;C++){const S=2+C*2;Q.push([w(f(r,S),f(e,S),f(l,S),f(d,S)),w(c(r,S),c(e,S),c(l,S),c(d,S))]),N.push([g(f(r,S),f(e,S),f(l,S),f(d,S)),g(c(r,S),c(e,S),c(l,S),c(d,S))])}return{ball:[f(e,0)+(f(l,0)-f(e,0))*o,c(e,0)+(c(l,0)-c(e,0))*o],pos:Q,vel:N,team:i[e*Rt+46],carrier:i[e*Rt+47]}}const pi=(s,t)=>t===0?s:us-s;function fi(s){const t=new Uint8Array(Nt),e=new Uint8Array(Nt),o=new Uint32Array(Nt);let i=0;for(let a=0;a<Nt;a++){const n=a*Rt,r=s.raw[n+46];t[a]=r,a>0&&r!==t[a-1]&&(i=a),o[a]=i;const l=s.raw[n+48]||1,d=pi(xe(s.raw[n]/10,l),r);a-i<8&&i>0?e[a]=3:e[a]=d<35?0:d<70?1:2}return{poss:t,phase:e,possStart:o}}async function mi(s,t=`./showcase/${s}/`,e=fetch){const o=async c=>{const w=await e(t+c);if(!w.ok)throw new Error(`${t+c} returned ${w.status}`);return w},[i,a,n]=await Promise.all([o("tracking.bin").then(c=>c.arrayBuffer()),o("events.json").then(c=>c.json()),o("meta.json").then(c=>c.json())]),r=new Int16Array(i),l=Array.from({length:22},(c,w)=>w<11?`H${w+1}`:`A${w-10}`),d=new Map([...n.home.players,...n.away.players].map(c=>[c.id,c])),f={id:s,raw:r,actions:[],names:l.map(c=>d.get(c)?.name??c),numbers:l.map(c=>d.get(c)?.number??0),roles:l.map(c=>d.get(c)?.position??""),short:[n.home.short_name,n.away.short_name],clubs:[n.home,n.away]};return f.actions=a.map(c=>{const w=c[0],g=r[Math.min(w,Nt-1)*Rt+48]||1;return{s:w,type:c[1],team:c[2],player:c[3],receiver:c[4],from:[xe(c[5],g),De(c[6],g)],to:[xe(c[7],g),De(c[8],g)],outcome:c[9],xg:c[10],pressure:c[11]}}),{...f,...fi(f)}}function gi(s=Ls){return Rs({queryKey:["lab",s],staleTime:1/0,queryFn:()=>mi(s)})}const Ke=s=>(s[0]==="H"?0:11)+Number(s.slice(1))-1,St=s=>s<11?0:1,$t=(s,t)=>{const e=s.backline.map(i=>s.sgn*t.pos[i][0]).sort((i,a)=>i-a),o=e.length%2?e[(e.length-1)/2]:(e[e.length/2-1]+e[e.length/2])/2;return s.sgn*o},Bt=(s,t)=>s.sgn*(t.pos[s.culprit][0]-$t(s,t)),ye=(s,t)=>Bt(s,t)>0?$t(s,t):t.pos[s.culprit][0],Zt=(s,t)=>{const e=t.pos.slice();return e[s.culprit]=[ye(s,t),t.pos[s.culprit][1]],{...t,pos:e}};function ve(s,t){const e=1-s.attack,o=[];for(let i=e*11;i<e*11+11;i++)o.push(s.sgn*t.pos[i][0]);return o.sort((i,a)=>a-i),s.sgn*o[1]}const Qt=(s,t,e,o)=>s.sgn*e>s.sgn*ve(s,t)&&s.sgn*e>s.sgn*o;function ie(s,t,e,o){const i=Math.hypot(e[0]-t[0],e[1]-t[1]),a=1-s.attack;let n=1;for(let r=a*11;r<a*11+11;r++){const l=o.pos[r];let d=0;for(let f=.1;f<=1.001;f+=.1){const c=t[0]+(e[0]-t[0])*f,w=t[1]+(e[1]-t[1])*f,g=.9+3*Math.max(0,i*f/18-.4),Q=1/(1+Math.exp(-(g-Math.hypot(l[0]-c,l[1]-w))/.5));Q>d&&(d=Q)}n*=1-.95*d}return n}const $e=(s,t,e)=>{const o=s.attack===0?105:0;return Math.min(.45,.012+.5*Math.exp(-Math.hypot(o-t,(34-e)*1.3)/13))};function bi(s,t){const e=t.links.find(x=>x.evidence_id===t.root_cause_evidence_id);if(!e)return null;const o=t.goal.second,i=Ke(e.player_id),a=Ke(t.goal.player_id??"H9"),n=1-St(i),r=n===0?1:-1,l=St(i),d=[1,2,3,4].map(x=>l*11+x).filter(x=>x!==i),f=we(s,o);let c=Math.max(Math.min(e.second,o)-22,0);for(;we(s,c)!==f;)c++;let w=Math.min(o+8,Nt-2);for(;we(s,w)!==f;)w--;const g={id:t.goal_id,goalS:o,rootS:e.second,dropS:e.second,culprit:i,scorer:a,attack:n,sgn:r,backline:d,t0:c,t1:w,decisions:[],pivot:-1,receiver:a,gapAtPass:0,maxGap:0,offsideBy:0,safeAsPlayed:1,safeWithFix:1,baseline:e.baseline_goals,fixed:e.fixed_goals,trials:e.trials};for(let x=c;x<=o;x+=.25)if(Bt(g,Et(s,x))>2){g.dropS=x;break}const Q=Math.max(c+1,s.possStart[Math.max(o-1,0)]-1);g.decisions=s.actions.filter(x=>x.team===n&&x.s>=Q&&x.s<=o&&(x.type==="pass"||x.type==="shot"&&x.s===o)).map(x=>({s:x.s,type:x.type,player:x.player,receiver:x.receiver,from:x.from,to:x.to,xg:x.xg})).slice(-11),g.decisions.forEach((x,C)=>{if(x.type!=="pass"||x.receiver==null||x.s<g.dropS-1||g.pivot>=0)return;const S=Et(s,x.s-.5),k=Zt(g,S),M=S.pos[x.receiver][0],B=g.sgn*(M-ve(g,k));B>.25&&Qt(g,k,M,x.from[0])&&!Qt(g,S,M,x.from[0])&&(g.pivot=C,g.offsideBy=B)});for(let x=c;x<=o;x+=.5)g.maxGap=Math.max(g.maxGap,Bt(g,Et(s,x)));const N=g.decisions[g.pivot];if(N){g.receiver=N.receiver??a;const x=Et(s,N.s-.5);g.gapAtPass=Math.max(0,Bt(g,x)),g.safeAsPlayed=ie(g,N.from,N.to,x),g.safeWithFix=ie(g,N.from,N.to,Zt(g,x))}return g}const Ze={type:"change"},Ue={type:"start"},ps={type:"end"},le=new Os,Qe=new js,xi=Math.cos(70*as.DEG2RAD),ct=new U,wt=2*Math.PI,I={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},Se=1e-6;class fs extends Ns{constructor(t,e=null){super(t,e),this.state=I.NONE,this.enabled=!0,this.target=new U,this.cursor=new U,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:"ArrowLeft",UP:"ArrowUp",RIGHT:"ArrowRight",BOTTOM:"ArrowDown"},this.mouseButtons={LEFT:Yt.ROTATE,MIDDLE:Yt.DOLLY,RIGHT:Yt.PAN},this.touches={ONE:Ht.ROTATE,TWO:Ht.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._domElementKeyEvents=null,this._lastPosition=new U,this._lastQuaternion=new We,this._lastTargetPosition=new U,this._quat=new We().setFromUnitVectors(t.up,new U(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new Ye,this._sphericalDelta=new Ye,this._scale=1,this._panOffset=new U,this._rotateStart=new Z,this._rotateEnd=new Z,this._rotateDelta=new Z,this._panStart=new Z,this._panEnd=new Z,this._panDelta=new Z,this._dollyStart=new Z,this._dollyEnd=new Z,this._dollyDelta=new Z,this._dollyDirection=new U,this._mouse=new Z,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=_i.bind(this),this._onPointerDown=yi.bind(this),this._onPointerUp=vi.bind(this),this._onContextMenu=Ci.bind(this),this._onMouseWheel=Mi.bind(this),this._onKeyDown=Ti.bind(this),this._onTouchStart=Ei.bind(this),this._onTouchMove=Pi.bind(this),this._onMouseDown=wi.bind(this),this._onMouseMove=Si.bind(this),this._interceptControlDown=ki.bind(this),this._interceptControlUp=Di.bind(this),this.domElement!==null&&this.connect(),this.update()}connect(){this.domElement.addEventListener("pointerdown",this._onPointerDown),this.domElement.addEventListener("pointercancel",this._onPointerUp),this.domElement.addEventListener("contextmenu",this._onContextMenu),this.domElement.addEventListener("wheel",this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener("keydown",this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction="none"}disconnect(){this.domElement.removeEventListener("pointerdown",this._onPointerDown),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.domElement.removeEventListener("pointercancel",this._onPointerUp),this.domElement.removeEventListener("wheel",this._onMouseWheel),this.domElement.removeEventListener("contextmenu",this._onContextMenu),this.stopListenToKeyEvents(),this.domElement.getRootNode().removeEventListener("keydown",this._interceptControlDown,{capture:!0}),this.domElement.style.touchAction="auto"}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(t){t.addEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=t}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(Ze),this.update(),this.state=I.NONE}update(t=null){const e=this.object.position;ct.copy(e).sub(this.target),ct.applyQuaternion(this._quat),this._spherical.setFromVector3(ct),this.autoRotate&&this.state===I.NONE&&this._rotateLeft(this._getAutoRotationAngle(t)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let o=this.minAzimuthAngle,i=this.maxAzimuthAngle;isFinite(o)&&isFinite(i)&&(o<-Math.PI?o+=wt:o>Math.PI&&(o-=wt),i<-Math.PI?i+=wt:i>Math.PI&&(i-=wt),o<=i?this._spherical.theta=Math.max(o,Math.min(i,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(o+i)/2?Math.max(o,this._spherical.theta):Math.min(i,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let a=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{const n=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),a=n!=this._spherical.radius}if(ct.setFromSpherical(this._spherical),ct.applyQuaternion(this._quatInverse),e.copy(this.target).add(ct),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let n=null;if(this.object.isPerspectiveCamera){const r=ct.length();n=this._clampDistance(r*this._scale);const l=r-n;this.object.position.addScaledVector(this._dollyDirection,l),this.object.updateMatrixWorld(),a=!!l}else if(this.object.isOrthographicCamera){const r=new U(this._mouse.x,this._mouse.y,0);r.unproject(this.object);const l=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),a=l!==this.object.zoom;const d=new U(this._mouse.x,this._mouse.y,0);d.unproject(this.object),this.object.position.sub(d).add(r),this.object.updateMatrixWorld(),n=ct.length()}else console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled."),this.zoomToCursor=!1;n!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(n).add(this.object.position):(le.origin.copy(this.object.position),le.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(le.direction))<xi?this.object.lookAt(this.target):(Qe.setFromNormalAndCoplanarPoint(this.object.up,this.target),le.intersectPlane(Qe,this.target))))}else if(this.object.isOrthographicCamera){const n=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),n!==this.object.zoom&&(this.object.updateProjectionMatrix(),a=!0)}return this._scale=1,this._performCursorZoom=!1,a||this._lastPosition.distanceToSquared(this.object.position)>Se||8*(1-this._lastQuaternion.dot(this.object.quaternion))>Se||this._lastTargetPosition.distanceToSquared(this.target)>Se?(this.dispatchEvent(Ze),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(t){return t!==null?wt/60*this.autoRotateSpeed*t:wt/60/60*this.autoRotateSpeed}_getZoomScale(t){const e=Math.abs(t*.01);return Math.pow(.95,this.zoomSpeed*e)}_rotateLeft(t){this._sphericalDelta.theta-=t}_rotateUp(t){this._sphericalDelta.phi-=t}_panLeft(t,e){ct.setFromMatrixColumn(e,0),ct.multiplyScalar(-t),this._panOffset.add(ct)}_panUp(t,e){this.screenSpacePanning===!0?ct.setFromMatrixColumn(e,1):(ct.setFromMatrixColumn(e,0),ct.crossVectors(this.object.up,ct)),ct.multiplyScalar(t),this._panOffset.add(ct)}_pan(t,e){const o=this.domElement;if(this.object.isPerspectiveCamera){const i=this.object.position;ct.copy(i).sub(this.target);let a=ct.length();a*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*t*a/o.clientHeight,this.object.matrix),this._panUp(2*e*a/o.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(t*(this.object.right-this.object.left)/this.object.zoom/o.clientWidth,this.object.matrix),this._panUp(e*(this.object.top-this.object.bottom)/this.object.zoom/o.clientHeight,this.object.matrix)):(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled."),this.enablePan=!1)}_dollyOut(t){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=t:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_dollyIn(t){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=t:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_updateZoomParameters(t,e){if(!this.zoomToCursor)return;this._performCursorZoom=!0;const o=this.domElement.getBoundingClientRect(),i=t-o.left,a=e-o.top,n=o.width,r=o.height;this._mouse.x=i/n*2-1,this._mouse.y=-(a/r)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(t){return Math.max(this.minDistance,Math.min(this.maxDistance,t))}_handleMouseDownRotate(t){this._rotateStart.set(t.clientX,t.clientY)}_handleMouseDownDolly(t){this._updateZoomParameters(t.clientX,t.clientX),this._dollyStart.set(t.clientX,t.clientY)}_handleMouseDownPan(t){this._panStart.set(t.clientX,t.clientY)}_handleMouseMoveRotate(t){this._rotateEnd.set(t.clientX,t.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);const e=this.domElement;this._rotateLeft(wt*this._rotateDelta.x/e.clientHeight),this._rotateUp(wt*this._rotateDelta.y/e.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(t){this._dollyEnd.set(t.clientX,t.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(t){this._panEnd.set(t.clientX,t.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(t){this._updateZoomParameters(t.clientX,t.clientY),t.deltaY<0?this._dollyIn(this._getZoomScale(t.deltaY)):t.deltaY>0&&this._dollyOut(this._getZoomScale(t.deltaY)),this.update()}_handleKeyDown(t){let e=!1;switch(t.code){case this.keys.UP:t.ctrlKey||t.metaKey||t.shiftKey?this._rotateUp(wt*this.rotateSpeed/this.domElement.clientHeight):this._pan(0,this.keyPanSpeed),e=!0;break;case this.keys.BOTTOM:t.ctrlKey||t.metaKey||t.shiftKey?this._rotateUp(-wt*this.rotateSpeed/this.domElement.clientHeight):this._pan(0,-this.keyPanSpeed),e=!0;break;case this.keys.LEFT:t.ctrlKey||t.metaKey||t.shiftKey?this._rotateLeft(wt*this.rotateSpeed/this.domElement.clientHeight):this._pan(this.keyPanSpeed,0),e=!0;break;case this.keys.RIGHT:t.ctrlKey||t.metaKey||t.shiftKey?this._rotateLeft(-wt*this.rotateSpeed/this.domElement.clientHeight):this._pan(-this.keyPanSpeed,0),e=!0;break}e&&(t.preventDefault(),this.update())}_handleTouchStartRotate(t){if(this._pointers.length===1)this._rotateStart.set(t.pageX,t.pageY);else{const e=this._getSecondPointerPosition(t),o=.5*(t.pageX+e.x),i=.5*(t.pageY+e.y);this._rotateStart.set(o,i)}}_handleTouchStartPan(t){if(this._pointers.length===1)this._panStart.set(t.pageX,t.pageY);else{const e=this._getSecondPointerPosition(t),o=.5*(t.pageX+e.x),i=.5*(t.pageY+e.y);this._panStart.set(o,i)}}_handleTouchStartDolly(t){const e=this._getSecondPointerPosition(t),o=t.pageX-e.x,i=t.pageY-e.y,a=Math.sqrt(o*o+i*i);this._dollyStart.set(0,a)}_handleTouchStartDollyPan(t){this.enableZoom&&this._handleTouchStartDolly(t),this.enablePan&&this._handleTouchStartPan(t)}_handleTouchStartDollyRotate(t){this.enableZoom&&this._handleTouchStartDolly(t),this.enableRotate&&this._handleTouchStartRotate(t)}_handleTouchMoveRotate(t){if(this._pointers.length==1)this._rotateEnd.set(t.pageX,t.pageY);else{const o=this._getSecondPointerPosition(t),i=.5*(t.pageX+o.x),a=.5*(t.pageY+o.y);this._rotateEnd.set(i,a)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);const e=this.domElement;this._rotateLeft(wt*this._rotateDelta.x/e.clientHeight),this._rotateUp(wt*this._rotateDelta.y/e.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(t){if(this._pointers.length===1)this._panEnd.set(t.pageX,t.pageY);else{const e=this._getSecondPointerPosition(t),o=.5*(t.pageX+e.x),i=.5*(t.pageY+e.y);this._panEnd.set(o,i)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(t){const e=this._getSecondPointerPosition(t),o=t.pageX-e.x,i=t.pageY-e.y,a=Math.sqrt(o*o+i*i);this._dollyEnd.set(0,a),this._dollyDelta.set(0,Math.pow(this._dollyEnd.y/this._dollyStart.y,this.zoomSpeed)),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);const n=(t.pageX+e.x)*.5,r=(t.pageY+e.y)*.5;this._updateZoomParameters(n,r)}_handleTouchMoveDollyPan(t){this.enableZoom&&this._handleTouchMoveDolly(t),this.enablePan&&this._handleTouchMovePan(t)}_handleTouchMoveDollyRotate(t){this.enableZoom&&this._handleTouchMoveDolly(t),this.enableRotate&&this._handleTouchMoveRotate(t)}_addPointer(t){this._pointers.push(t.pointerId)}_removePointer(t){delete this._pointerPositions[t.pointerId];for(let e=0;e<this._pointers.length;e++)if(this._pointers[e]==t.pointerId){this._pointers.splice(e,1);return}}_isTrackingPointer(t){for(let e=0;e<this._pointers.length;e++)if(this._pointers[e]==t.pointerId)return!0;return!1}_trackPointer(t){let e=this._pointerPositions[t.pointerId];e===void 0&&(e=new Z,this._pointerPositions[t.pointerId]=e),e.set(t.pageX,t.pageY)}_getSecondPointerPosition(t){const e=t.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[e]}_customWheelEvent(t){const e=t.deltaMode,o={clientX:t.clientX,clientY:t.clientY,deltaY:t.deltaY};switch(e){case 1:o.deltaY*=16;break;case 2:o.deltaY*=100;break}return t.ctrlKey&&!this._controlActive&&(o.deltaY*=10),o}}function yi(s){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(s.pointerId),this.domElement.addEventListener("pointermove",this._onPointerMove),this.domElement.addEventListener("pointerup",this._onPointerUp)),!this._isTrackingPointer(s)&&(this._addPointer(s),s.pointerType==="touch"?this._onTouchStart(s):this._onMouseDown(s)))}function _i(s){this.enabled!==!1&&(s.pointerType==="touch"?this._onTouchMove(s):this._onMouseMove(s))}function vi(s){switch(this._removePointer(s),this._pointers.length){case 0:this.domElement.releasePointerCapture(s.pointerId),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.dispatchEvent(ps),this.state=I.NONE;break;case 1:const t=this._pointers[0],e=this._pointerPositions[t];this._onTouchStart({pointerId:t,pageX:e.x,pageY:e.y});break}}function wi(s){let t;switch(s.button){case 0:t=this.mouseButtons.LEFT;break;case 1:t=this.mouseButtons.MIDDLE;break;case 2:t=this.mouseButtons.RIGHT;break;default:t=-1}switch(t){case Yt.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(s),this.state=I.DOLLY;break;case Yt.ROTATE:if(s.ctrlKey||s.metaKey||s.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(s),this.state=I.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(s),this.state=I.ROTATE}break;case Yt.PAN:if(s.ctrlKey||s.metaKey||s.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(s),this.state=I.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(s),this.state=I.PAN}break;default:this.state=I.NONE}this.state!==I.NONE&&this.dispatchEvent(Ue)}function Si(s){switch(this.state){case I.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(s);break;case I.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(s);break;case I.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(s);break}}function Mi(s){this.enabled===!1||this.enableZoom===!1||this.state!==I.NONE||(s.preventDefault(),this.dispatchEvent(Ue),this._handleMouseWheel(this._customWheelEvent(s)),this.dispatchEvent(ps))}function Ti(s){this.enabled===!1||this.enablePan===!1||this._handleKeyDown(s)}function Ei(s){switch(this._trackPointer(s),this._pointers.length){case 1:switch(this.touches.ONE){case Ht.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(s),this.state=I.TOUCH_ROTATE;break;case Ht.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(s),this.state=I.TOUCH_PAN;break;default:this.state=I.NONE}break;case 2:switch(this.touches.TWO){case Ht.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(s),this.state=I.TOUCH_DOLLY_PAN;break;case Ht.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(s),this.state=I.TOUCH_DOLLY_ROTATE;break;default:this.state=I.NONE}break;default:this.state=I.NONE}this.state!==I.NONE&&this.dispatchEvent(Ue)}function Pi(s){switch(this._trackPointer(s),this.state){case I.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(s),this.update();break;case I.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(s),this.update();break;case I.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(s),this.update();break;case I.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(s),this.update();break;default:this.state=I.NONE}}function Ci(s){this.enabled!==!1&&s.preventDefault()}function ki(s){s.key==="Control"&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}function Di(s){s.key==="Control"&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}const qe=new Le,ce=new U;class ms extends Us{constructor(){super(),this.isLineSegmentsGeometry=!0,this.type="LineSegmentsGeometry";const t=[-1,2,0,1,2,0,-1,1,0,1,1,0,-1,0,0,1,0,0,-1,-1,0,1,-1,0],e=[-1,2,1,2,-1,1,1,1,-1,-1,1,-1,-1,-2,1,-2],o=[0,2,1,2,3,1,2,4,3,4,5,3,4,6,5,6,7,5];this.setIndex(o),this.setAttribute("position",new se(t,3)),this.setAttribute("uv",new se(e,2))}applyMatrix4(t){const e=this.attributes.instanceStart,o=this.attributes.instanceEnd;return e!==void 0&&(e.applyMatrix4(t),o.applyMatrix4(t),e.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}setPositions(t){let e;t instanceof Float32Array?e=t:Array.isArray(t)&&(e=new Float32Array(t));const o=new ke(e,6,1);return this.setAttribute("instanceStart",new Gt(o,3,0)),this.setAttribute("instanceEnd",new Gt(o,3,3)),this.instanceCount=this.attributes.instanceStart.count,this.computeBoundingBox(),this.computeBoundingSphere(),this}setColors(t){let e;t instanceof Float32Array?e=t:Array.isArray(t)&&(e=new Float32Array(t));const o=new ke(e,6,1);return this.setAttribute("instanceColorStart",new Gt(o,3,0)),this.setAttribute("instanceColorEnd",new Gt(o,3,3)),this}fromWireframeGeometry(t){return this.setPositions(t.attributes.position.array),this}fromEdgesGeometry(t){return this.setPositions(t.attributes.position.array),this}fromMesh(t){return this.fromWireframeGeometry(new zs(t.geometry)),this}fromLineSegments(t){const e=t.geometry;return this.setPositions(e.attributes.position.array),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Le);const t=this.attributes.instanceStart,e=this.attributes.instanceEnd;t!==void 0&&e!==void 0&&(this.boundingBox.setFromBufferAttribute(t),qe.setFromBufferAttribute(e),this.boundingBox.union(qe))}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new ns),this.boundingBox===null&&this.computeBoundingBox();const t=this.attributes.instanceStart,e=this.attributes.instanceEnd;if(t!==void 0&&e!==void 0){const o=this.boundingSphere.center;this.boundingBox.getCenter(o);let i=0;for(let a=0,n=t.count;a<n;a++)ce.fromBufferAttribute(t,a),i=Math.max(i,o.distanceToSquared(ce)),ce.fromBufferAttribute(e,a),i=Math.max(i,o.distanceToSquared(ce));this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)&&console.error("THREE.LineSegmentsGeometry.computeBoundingSphere(): Computed radius is NaN. The instanced position data is likely to have NaN values.",this)}}toJSON(){}applyMatrix(t){return console.warn("THREE.LineSegmentsGeometry: applyMatrix() has been renamed to applyMatrix4()."),this.applyMatrix4(t)}}me.line={worldUnits:{value:1},linewidth:{value:1},resolution:{value:new Z(1,1)},dashOffset:{value:0},dashScale:{value:1},dashSize:{value:1},gapSize:{value:1}};fe.line={uniforms:Vt.merge([me.common,me.fog,me.line]),vertexShader:`
		#include <common>
		#include <color_pars_vertex>
		#include <fog_pars_vertex>
		#include <logdepthbuf_pars_vertex>
		#include <clipping_planes_pars_vertex>

		uniform float linewidth;
		uniform vec2 resolution;

		attribute vec3 instanceStart;
		attribute vec3 instanceEnd;

		attribute vec3 instanceColorStart;
		attribute vec3 instanceColorEnd;

		#ifdef WORLD_UNITS

			varying vec4 worldPos;
			varying vec3 worldStart;
			varying vec3 worldEnd;

			#ifdef USE_DASH

				varying vec2 vUv;

			#endif

		#else

			varying vec2 vUv;

		#endif

		#ifdef USE_DASH

			uniform float dashScale;
			attribute float instanceDistanceStart;
			attribute float instanceDistanceEnd;
			varying float vLineDistance;

		#endif

		void trimSegment( const in vec4 start, inout vec4 end ) {

			// trim end segment so it terminates between the camera plane and the near plane

			// conservative estimate of the near plane
			float a = projectionMatrix[ 2 ][ 2 ]; // 3nd entry in 3th column
			float b = projectionMatrix[ 3 ][ 2 ]; // 3nd entry in 4th column
			float nearEstimate = - 0.5 * b / a;

			float alpha = ( nearEstimate - start.z ) / ( end.z - start.z );

			end.xyz = mix( start.xyz, end.xyz, alpha );

		}

		void main() {

			#ifdef USE_COLOR

				vColor.xyz = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;

			#endif

			#ifdef USE_DASH

				vLineDistance = ( position.y < 0.5 ) ? dashScale * instanceDistanceStart : dashScale * instanceDistanceEnd;
				vUv = uv;

			#endif

			float aspect = resolution.x / resolution.y;

			// camera space
			vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
			vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

			#ifdef WORLD_UNITS

				worldStart = start.xyz;
				worldEnd = end.xyz;

			#else

				vUv = uv;

			#endif

			// special case for perspective projection, and segments that terminate either in, or behind, the camera plane
			// clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
			// but we need to perform ndc-space calculations in the shader, so we must address this issue directly
			// perhaps there is a more elegant solution -- WestLangley

			bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ); // 4th entry in the 3rd column

			if ( perspective ) {

				if ( start.z < 0.0 && end.z >= 0.0 ) {

					trimSegment( start, end );

				} else if ( end.z < 0.0 && start.z >= 0.0 ) {

					trimSegment( end, start );

				}

			}

			// clip space
			vec4 clipStart = projectionMatrix * start;
			vec4 clipEnd = projectionMatrix * end;

			// ndc space
			vec3 ndcStart = clipStart.xyz / clipStart.w;
			vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

			// direction
			vec2 dir = ndcEnd.xy - ndcStart.xy;

			// account for clip-space aspect ratio
			dir.x *= aspect;
			dir = normalize( dir );

			#ifdef WORLD_UNITS

				vec3 worldDir = normalize( end.xyz - start.xyz );
				vec3 tmpFwd = normalize( mix( start.xyz, end.xyz, 0.5 ) );
				vec3 worldUp = normalize( cross( worldDir, tmpFwd ) );
				vec3 worldFwd = cross( worldDir, worldUp );
				worldPos = position.y < 0.5 ? start: end;

				// height offset
				float hw = linewidth * 0.5;
				worldPos.xyz += position.x < 0.0 ? hw * worldUp : - hw * worldUp;

				// don't extend the line if we're rendering dashes because we
				// won't be rendering the endcaps
				#ifndef USE_DASH

					// cap extension
					worldPos.xyz += position.y < 0.5 ? - hw * worldDir : hw * worldDir;

					// add width to the box
					worldPos.xyz += worldFwd * hw;

					// endcaps
					if ( position.y > 1.0 || position.y < 0.0 ) {

						worldPos.xyz -= worldFwd * 2.0 * hw;

					}

				#endif

				// project the worldpos
				vec4 clip = projectionMatrix * worldPos;

				// shift the depth of the projected points so the line
				// segments overlap neatly
				vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
				clip.z = clipPose.z * clip.w;

			#else

				vec2 offset = vec2( dir.y, - dir.x );
				// undo aspect ratio adjustment
				dir.x /= aspect;
				offset.x /= aspect;

				// sign flip
				if ( position.x < 0.0 ) offset *= - 1.0;

				// endcaps
				if ( position.y < 0.0 ) {

					offset += - dir;

				} else if ( position.y > 1.0 ) {

					offset += dir;

				}

				// adjust for linewidth
				offset *= linewidth;

				// adjust for clip-space to screen-space conversion // maybe resolution should be based on viewport ...
				offset /= resolution.y;

				// select end
				vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;

				// back to clip space
				offset *= clip.w;

				clip.xy += offset;

			#endif

			gl_Position = clip;

			vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

			#include <logdepthbuf_vertex>
			#include <clipping_planes_vertex>
			#include <fog_vertex>

		}
		`,fragmentShader:`
		uniform vec3 diffuse;
		uniform float opacity;
		uniform float linewidth;

		#ifdef USE_DASH

			uniform float dashOffset;
			uniform float dashSize;
			uniform float gapSize;

		#endif

		varying float vLineDistance;

		#ifdef WORLD_UNITS

			varying vec4 worldPos;
			varying vec3 worldStart;
			varying vec3 worldEnd;

			#ifdef USE_DASH

				varying vec2 vUv;

			#endif

		#else

			varying vec2 vUv;

		#endif

		#include <common>
		#include <color_pars_fragment>
		#include <fog_pars_fragment>
		#include <logdepthbuf_pars_fragment>
		#include <clipping_planes_pars_fragment>

		vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4) {

			float mua;
			float mub;

			vec3 p13 = p1 - p3;
			vec3 p43 = p4 - p3;

			vec3 p21 = p2 - p1;

			float d1343 = dot( p13, p43 );
			float d4321 = dot( p43, p21 );
			float d1321 = dot( p13, p21 );
			float d4343 = dot( p43, p43 );
			float d2121 = dot( p21, p21 );

			float denom = d2121 * d4343 - d4321 * d4321;

			float numer = d1343 * d4321 - d1321 * d4343;

			mua = numer / denom;
			mua = clamp( mua, 0.0, 1.0 );
			mub = ( d1343 + d4321 * ( mua ) ) / d4343;
			mub = clamp( mub, 0.0, 1.0 );

			return vec2( mua, mub );

		}

		void main() {

			#include <clipping_planes_fragment>

			#ifdef USE_DASH

				if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard; // discard endcaps

				if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX

			#endif

			float alpha = opacity;

			#ifdef WORLD_UNITS

				// Find the closest points on the view ray and the line segment
				vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
				vec3 lineDir = worldEnd - worldStart;
				vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );

				vec3 p1 = worldStart + lineDir * params.x;
				vec3 p2 = rayEnd * params.y;
				vec3 delta = p1 - p2;
				float len = length( delta );
				float norm = len / linewidth;

				#ifndef USE_DASH

					#ifdef USE_ALPHA_TO_COVERAGE

						float dnorm = fwidth( norm );
						alpha = 1.0 - smoothstep( 0.5 - dnorm, 0.5 + dnorm, norm );

					#else

						if ( norm > 0.5 ) {

							discard;

						}

					#endif

				#endif

			#else

				#ifdef USE_ALPHA_TO_COVERAGE

					// artifacts appear on some hardware if a derivative is taken within a conditional
					float a = vUv.x;
					float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
					float len2 = a * a + b * b;
					float dlen = fwidth( len2 );

					if ( abs( vUv.y ) > 1.0 ) {

						alpha = 1.0 - smoothstep( 1.0 - dlen, 1.0 + dlen, len2 );

					}

				#else

					if ( abs( vUv.y ) > 1.0 ) {

						float a = vUv.x;
						float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
						float len2 = a * a + b * b;

						if ( len2 > 1.0 ) discard;

					}

				#endif

			#endif

			vec4 diffuseColor = vec4( diffuse, alpha );

			#include <logdepthbuf_fragment>
			#include <color_fragment>

			gl_FragColor = vec4( diffuseColor.rgb, alpha );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>
			#include <fog_fragment>
			#include <premultiplied_alpha_fragment>

		}
		`};class ze extends Ut{static get type(){return"LineMaterial"}constructor(t){super({uniforms:Vt.clone(fe.line.uniforms),vertexShader:fe.line.vertexShader,fragmentShader:fe.line.fragmentShader,clipping:!0}),this.isLineMaterial=!0,this.setValues(t)}get color(){return this.uniforms.diffuse.value}set color(t){this.uniforms.diffuse.value=t}get worldUnits(){return"WORLD_UNITS"in this.defines}set worldUnits(t){t===!0?this.defines.WORLD_UNITS="":delete this.defines.WORLD_UNITS}get linewidth(){return this.uniforms.linewidth.value}set linewidth(t){this.uniforms.linewidth&&(this.uniforms.linewidth.value=t)}get dashed(){return"USE_DASH"in this.defines}set dashed(t){t===!0!==this.dashed&&(this.needsUpdate=!0),t===!0?this.defines.USE_DASH="":delete this.defines.USE_DASH}get dashScale(){return this.uniforms.dashScale.value}set dashScale(t){this.uniforms.dashScale.value=t}get dashSize(){return this.uniforms.dashSize.value}set dashSize(t){this.uniforms.dashSize.value=t}get dashOffset(){return this.uniforms.dashOffset.value}set dashOffset(t){this.uniforms.dashOffset.value=t}get gapSize(){return this.uniforms.gapSize.value}set gapSize(t){this.uniforms.gapSize.value=t}get opacity(){return this.uniforms.opacity.value}set opacity(t){this.uniforms&&(this.uniforms.opacity.value=t)}get resolution(){return this.uniforms.resolution.value}set resolution(t){this.uniforms.resolution.value.copy(t)}get alphaToCoverage(){return"USE_ALPHA_TO_COVERAGE"in this.defines}set alphaToCoverage(t){this.defines&&(t===!0!==this.alphaToCoverage&&(this.needsUpdate=!0),t===!0?this.defines.USE_ALPHA_TO_COVERAGE="":delete this.defines.USE_ALPHA_TO_COVERAGE)}}const Me=new oe,Je=new U,ts=new U,ft=new oe,mt=new oe,Pt=new oe,Te=new U,Ee=new Fs,gt=new Bs,es=new U,he=new Le,de=new ns,Ct=new oe;let Dt,Ft;function ss(s,t,e){return Ct.set(0,0,-t,1).applyMatrix4(s.projectionMatrix),Ct.multiplyScalar(1/Ct.w),Ct.x=Ft/e.width,Ct.y=Ft/e.height,Ct.applyMatrix4(s.projectionMatrixInverse),Ct.multiplyScalar(1/Ct.w),Math.abs(Math.max(Ct.x,Ct.y))}function Ai(s,t){const e=s.matrixWorld,o=s.geometry,i=o.attributes.instanceStart,a=o.attributes.instanceEnd,n=Math.min(o.instanceCount,i.count);for(let r=0,l=n;r<l;r++){gt.start.fromBufferAttribute(i,r),gt.end.fromBufferAttribute(a,r),gt.applyMatrix4(e);const d=new U,f=new U;Dt.distanceSqToSegment(gt.start,gt.end,f,d),f.distanceTo(d)<Ft*.5&&t.push({point:f,pointOnLine:d,distance:Dt.origin.distanceTo(f),object:s,face:null,faceIndex:r,uv:null,uv1:null})}}function Li(s,t,e){const o=t.projectionMatrix,a=s.material.resolution,n=s.matrixWorld,r=s.geometry,l=r.attributes.instanceStart,d=r.attributes.instanceEnd,f=Math.min(r.instanceCount,l.count),c=-t.near;Dt.at(1,Pt),Pt.w=1,Pt.applyMatrix4(t.matrixWorldInverse),Pt.applyMatrix4(o),Pt.multiplyScalar(1/Pt.w),Pt.x*=a.x/2,Pt.y*=a.y/2,Pt.z=0,Te.copy(Pt),Ee.multiplyMatrices(t.matrixWorldInverse,n);for(let w=0,g=f;w<g;w++){if(ft.fromBufferAttribute(l,w),mt.fromBufferAttribute(d,w),ft.w=1,mt.w=1,ft.applyMatrix4(Ee),mt.applyMatrix4(Ee),ft.z>c&&mt.z>c)continue;if(ft.z>c){const k=ft.z-mt.z,M=(ft.z-c)/k;ft.lerp(mt,M)}else if(mt.z>c){const k=mt.z-ft.z,M=(mt.z-c)/k;mt.lerp(ft,M)}ft.applyMatrix4(o),mt.applyMatrix4(o),ft.multiplyScalar(1/ft.w),mt.multiplyScalar(1/mt.w),ft.x*=a.x/2,ft.y*=a.y/2,mt.x*=a.x/2,mt.y*=a.y/2,gt.start.copy(ft),gt.start.z=0,gt.end.copy(mt),gt.end.z=0;const N=gt.closestPointToPointParameter(Te,!0);gt.at(N,es);const x=as.lerp(ft.z,mt.z,N),C=x>=-1&&x<=1,S=Te.distanceTo(es)<Ft*.5;if(C&&S){gt.start.fromBufferAttribute(l,w),gt.end.fromBufferAttribute(d,w),gt.start.applyMatrix4(n),gt.end.applyMatrix4(n);const k=new U,M=new U;Dt.distanceSqToSegment(gt.start,gt.end,M,k),e.push({point:M,pointOnLine:k,distance:Dt.origin.distanceTo(M),object:s,face:null,faceIndex:w,uv:null,uv1:null})}}}class Ri extends ot{constructor(t=new ms,e=new ze({color:Math.random()*16777215})){super(t,e),this.isLineSegments2=!0,this.type="LineSegments2"}computeLineDistances(){const t=this.geometry,e=t.attributes.instanceStart,o=t.attributes.instanceEnd,i=new Float32Array(2*e.count);for(let n=0,r=0,l=e.count;n<l;n++,r+=2)Je.fromBufferAttribute(e,n),ts.fromBufferAttribute(o,n),i[r]=r===0?0:i[r-1],i[r+1]=i[r]+Je.distanceTo(ts);const a=new ke(i,2,1);return t.setAttribute("instanceDistanceStart",new Gt(a,1,0)),t.setAttribute("instanceDistanceEnd",new Gt(a,1,1)),this}raycast(t,e){const o=this.material.worldUnits,i=t.camera;i===null&&!o&&console.error('LineSegments2: "Raycaster.camera" needs to be set in order to raycast against LineSegments2 while worldUnits is set to false.');const a=t.params.Line2!==void 0&&t.params.Line2.threshold||0;Dt=t.ray;const n=this.matrixWorld,r=this.geometry,l=this.material;Ft=l.linewidth+a,r.boundingSphere===null&&r.computeBoundingSphere(),de.copy(r.boundingSphere).applyMatrix4(n);let d;if(o)d=Ft*.5;else{const c=Math.max(i.near,de.distanceToPoint(Dt.origin));d=ss(i,c,l.resolution)}if(de.radius+=d,Dt.intersectsSphere(de)===!1)return;r.boundingBox===null&&r.computeBoundingBox(),he.copy(r.boundingBox).applyMatrix4(n);let f;if(o)f=Ft*.5;else{const c=Math.max(i.near,he.distanceToPoint(Dt.origin));f=ss(i,c,l.resolution)}he.expandByScalar(f),Dt.intersectsBox(he)!==!1&&(o?Ai(this,e):Li(this,i,e))}onBeforeRender(t){const e=this.material.uniforms;e&&e.resolution&&(t.getViewport(Me),this.material.uniforms.resolution.value.set(Me.z,Me.w))}}class Be extends ms{constructor(){super(),this.isLineGeometry=!0,this.type="LineGeometry"}setPositions(t){const e=t.length-3,o=new Float32Array(2*e);for(let i=0;i<e;i+=3)o[2*i]=t[i],o[2*i+1]=t[i+1],o[2*i+2]=t[i+2],o[2*i+3]=t[i+3],o[2*i+4]=t[i+4],o[2*i+5]=t[i+5];return super.setPositions(o),this}setColors(t){const e=t.length-3,o=new Float32Array(2*e);for(let i=0;i<e;i+=3)o[2*i]=t[i],o[2*i+1]=t[i+1],o[2*i+2]=t[i+2],o[2*i+3]=t[i+3],o[2*i+4]=t[i+4],o[2*i+5]=t[i+5];return super.setColors(o),this}fromLine(t){const e=t.geometry;return this.setPositions(e.attributes.position.array),this}}class Ni extends Ri{constructor(t=new Be,e=new ze({color:Math.random()*16777215})){super(t,e),this.isLine2=!0,this.type="Line2"}}const _t={home:new At("#6ea8ff"),away:new At("#ff6b5e"),ball:new At("#ffffff"),bug:new At("#ffd60a")},gs=395544,It=s=>s<11?_t.home:_t.away,rt=s=>{const t=Math.round(s);return`${Math.floor(t/60)}:${String(t%60).padStart(2,"0")}`},tt=(s,t)=>s.names[t].split(" ").slice(-1)[0],Ae=(s,t)=>`#${s.numbers[t]} ${s.names[t]}`,te=(s,t,e=0)=>new U(s-52.5,e,t-34);function _e({fill:s="",stripes:t="",line:e="rgba(255,255,255,.6)",lw:o=.14,pad:i=0,k:a=20}={}){const n=document.createElement("canvas");n.width=(105+2*i)*a,n.height=(68+2*i)*a;const r=n.getContext("2d");if(s&&(r.fillStyle=s,r.fillRect(0,0,n.width,n.height)),r.translate(i*a,i*a),r.scale(a,a),t){r.fillStyle=t;for(let l=0;l<14;l+=2)r.fillRect(l*7.5,0,7.5,68)}r.strokeStyle=e,r.lineWidth=o,r.strokeRect(0,0,105,68),r.beginPath(),r.moveTo(52.5,0),r.lineTo(52.5,68),r.stroke(),r.beginPath(),r.arc(52.5,34,9.15,0,7),r.stroke();for(const l of[0,1]){const d=c=>l?105-c:c;r.strokeRect(Math.min(d(0),d(16.5)),13.84,16.5,40.32),r.strokeRect(Math.min(d(0),d(5.5)),24.84,5.5,18.32);const f=Math.acos(5.5/9.15);r.beginPath(),l?r.arc(d(11),34,9.15,Math.PI-f,Math.PI+f):r.arc(d(11),34,9.15,-f,f),r.stroke(),r.fillStyle=e,r.beginPath(),r.arc(d(11),34,.25,0,7),r.fill(),i&&r.strokeRect(l?105:-2,30.34,2,7.32)}return n}function qt(s){const t=new Is(s);return t.colorSpace=Hs,t.anisotropy=8,t}function bs(s,{color:t="#e9ecff",bg:e="rgba(6,9,24,.85)",size:o=40,bold:i=!0}){const a=document.createElement("canvas"),n=a.getContext("2d"),r=`${i?700:500} ${o}px "Hanken Grotesk Variable", "Noto Sans Devanagari", system-ui, sans-serif`;n.font=r;const l=Math.ceil(n.measureText(s).width)+o;return a.width=l,a.height=Math.round(o*1.6),n.font=r,e&&(n.fillStyle=e,n.beginPath(),n.roundRect(0,0,l,a.height,a.height/2),n.fill()),n.fillStyle=t,n.textBaseline="middle",n.fillText(s,o/2,a.height/2+1),a}function Ot(s,t={}){const e=bs(s,t),o=new rs(new Ws({map:qt(e),depthTest:!1,transparent:!0})),i=t.h??2.6;return o.scale.set(i*e.width/e.height,i,1),o.renderOrder=20,o.userData={text:s,opts:t},o}function Oi(s,t){if(s.userData.text===t)return;const e=s.userData.opts,o=bs(t,e);s.material.map?.dispose(),s.material.map=qt(o);const i=e.h??2.6;s.scale.set(i*o.width/o.height,i,1),s.userData.text=t}function Tt(s,t={}){const e=new ze({linewidth:s,vertexColors:!0,transparent:!0,depthWrite:!1,blending:t.additive===!1?Gs:Wt,dashed:!!t.dashed,dashSize:t.dash??1.2,gapSize:t.gap??.9}),o=new Ni(new Be,e);return o.frustumCulled=!1,o.renderOrder=t.order??1,o}function kt(s,t,e){const o=new Be;o.setPositions(t),o.setColors(e),s.geometry.dispose(),s.geometry=o,s.material.dashed&&s.computeLineDistances()}function is(s,t,e,o=28){const i=[];for(let a=0;a<=o;a++){const n=a/o,r=s.clone().lerp(t,n);r.y+=Math.sin(Math.PI*n)*e,i.push(r)}return i}function xs(s,t,e){const o=s.clone().project(t),i=e.getBoundingClientRect();return[(o.x*.5+.5)*i.width,(-o.y*.5+.5)*i.height]}function ys(s,t){let e=null;const o=a=>e=[a.clientX,a.clientY],i=a=>{e&&Math.hypot(a.clientX-e[0],a.clientY-e[1])<4&&t(a),e=null};return{on(){s.addEventListener("pointerdown",o),s.addEventListener("pointerup",i)},off(){s.removeEventListener("pointerdown",o),s.removeEventListener("pointerup",i)}}}function Fe(s){s.traverse(t=>{const e=t;e.geometry?.dispose();const o=Array.isArray(e.material)?e.material:e.material?[e.material]:[];for(const i of o)i.map?.dispose(),i.dispose()})}function ji(s){const{lab:t,c:e,canvas:o,t:i}=s,a=5.5,n=new Re;n.fog=new ls(gs,.004);const r=new Ne(38,1,.5,900);r.position.set(-48*e.sgn,66,118);const l=new fs(r,o);l.target.set(22*e.sgn,20,0),l.enableDamping=!0,l.minDistance=30,l.maxDistance=320;const d=e.decisions.map((D,_)=>({...D,y:_*a})),f=qt(_e({line:"rgba(160,176,255,.9)",lw:.22,k:10})),c=d.map(D=>{const _=new Oe;_.position.y=D.y;const P=new ot(new zt(105,68).rotateX(-Math.PI/2),new bt({map:f,transparent:!0,opacity:.2,depthWrite:!1,side:Xt})),H=new ot(new zt(105,68).rotateX(-Math.PI/2),new bt({color:1388758,transparent:!0,opacity:.05,depthWrite:!1,side:Xt})),p=Et(t,D.s-.5),q=new Ys(new ge(.85,16).rotateX(-Math.PI/2),new bt({transparent:!0,opacity:.9}),22),T=new Xs;p.pos.forEach(([R,A],b)=>{T.position.set(R-52.5,.05,A-34),T.updateMatrix(),q.setMatrixAt(b,T.matrix),q.setColorAt(b,b===e.culprit?_t.bug:It(b))});const y=D.type==="shot"?i("lab.floorShot",{clock:rt(D.s),name:tt(t,D.player)}):i("lab.floor",{clock:rt(D.s),from:tt(t,D.player),to:tt(t,D.receiver??D.player)}),O=Ot(y,{color:"#e9ecff",bg:"rgba(21,48,214,.9)",size:32,h:3.8});return O.position.set(D.from[0]-52.5,3.2,D.from[1]-34),O.center.set(.5,0),_.add(P,H,q,O),n.add(_),{m:P,tint:H,dots:q,lb:O,f:p}}),w=[],g=new ot(new be(.9,20,14),new bt({color:16777215})),Q=new ot(new cs(2.5,3.2,48).rotateY(Math.PI/2),new bt({color:16777215,transparent:!0,side:Xt})),N=Ot(i("lab.offsideFixM",{m:e.offsideBy.toFixed(1)}),{color:"#1a1600",bg:"#ffd60a",size:34,h:4});n.add(g,Q,N);const x=e.attack===0?105:0,C=e.attack;let S=null;function k(D){for(const _ of w)n.remove(_.line),_.line.geometry.dispose(),_.line.material.dispose();w.length=0,d.forEach((_,P)=>{const H=c[P].f,p=D?Zt(e,H):H,q=_.y,T=d[P+1]?d[P+1].y:_.y+a,y=te(_.from[0],_.from[1],q);if(_.type==="shot"){const A=is(y,te(x,34.5,q+1.2),3),b=Tt(4.5,{order:4});kt(b,A.flatMap(W=>[W.x,W.y,W.z]),A.flatMap(()=>[1,1,1])),n.add(b),w.push({line:b,k:P,chosen:!0,better:!1,pts:A,info:i("lab.shotTag",{name:Ae(t,_.player),xg:(_.xg??0).toFixed(2)})});return}const O=ie(e,_.from,_.to,p),R=$e(e,..._.to);for(let A=C*11+1;A<C*11+11;A++){if(A===_.player)continue;const b=A===_.receiver,W=b?_.to:H.pos[A],ht=b?O:ie(e,_.from,W,p),ut=$e(e,...W),u=Qt(e,p,H.pos[A][0],_.from[0]),m=!b&&!u&&ht>=O&&ut>R*1.3,h=te(W[0],W[1],b?T:q+a*.55),z=is(y,h,b?2.5+y.distanceTo(h)*.05:1+ut*40),E=new At;let L;b?(L=Tt(u?4:4.5,{order:4,dashed:u}),E.set(u?_t.bug:14673663).multiplyScalar(.8)):(L=Tt(m?2.6:1.5,{dashed:u,order:2}),u?E.set(5922688):m?E.copy(_t.bug):E.copy(It(_.player)).multiplyScalar(.25+1.1*ht));const G=z.flatMap((J,nt)=>{const pt=nt/(z.length-1),et=E.clone().multiplyScalar(b?1:.55+.45*pt);return[et.r,et.g,et.b]});kt(L,z.flatMap(J=>[J.x,J.y,J.z]),G),n.add(L);const X=[i("lab.branch.safe",{p:Math.round(ht*100)}),i("lab.branch.threat",{v:ut.toFixed(2)})];u&&X.push(i("lab.branch.offside")),m&&X.push(i("lab.branch.better")),w.push({line:L,k:P,chosen:b,better:m,pts:z,info:`${b?i("lab.branch.played"):""}${tt(t,_.player)} → ${Ae(t,A)}<small>${X.join(" · ")}</small>`})}}),S=D}let M=null;const B=D=>{const _=o.getBoundingClientRect(),P=D.clientX-_.left,H=D.clientY-_.top;let p=null,q=12;for(const T of w)if(T.line.visible)for(let y=2;y<T.pts.length;y+=3){const[O,R]=xs(T.pts[y],r,o),A=Math.hypot(O-P,R-H);A<q&&(q=A,p=[T,O,R])}if(M=p?p[0]:null,!p)return s.untag();s.tag(p[1],p[2],p[0].info)},lt=ys(o,()=>{M&&s.seek(d[M.k].s-.3)}),dt=D=>{let _=0;return d.forEach((P,H)=>{D>=P.s-.3&&(_=H)}),_},at=tt(t,e.culprit),K=tt(t,e.receiver);return{scene:n,camera:r,controls:l,bloom:[.32,.4,.4],start:d.length?d[0].s-1:e.t0,tools:()=>[{id:"prev",label:i("lab.prevTouch"),on:()=>d.length&&s.seek(d[Math.max(dt(s.state.t)-1,0)].s-.3)},{id:"next",label:i("lab.nextTouch"),on:()=>d.length&&s.seek(d[Math.min(dt(s.state.t)+1,d.length-1)].s-.3)}],frame(D){S!==s.state.fix&&k(s.state.fix);const _={name:at,receiver:K,scorer:tt(t,e.scorer),trials:e.trials,base:e.baseline,fixed:e.fixed,n:d.length};if(!d.length)return{kind:"",k:rt(D),html:""};const P=dt(D),H=s.state.fix&&e.pivot>=0&&e.offsideBy>0?e.pivot:99;c.forEach((b,W)=>{const ht=W===P,ut=W>H;b.m.material.opacity=ut?.03:ht?.75:.16,b.tint.material.opacity=ht?.16:.03,b.dots.visible=!ut&&Math.abs(W-P)<=1,b.dots.material.opacity=ht?1:.35,b.lb.visible=ht&&!ut});for(const b of w)b.line.visible=b.k<=H&&(b.chosen||b.k===P||b.better),b.line.material.opacity=b.k===P||b.chosen?1:.5;const p=d[P],q=d[P+1],T=w.find(b=>b.k===P&&b.chosen);if(T){const b=Math.min(Math.max(q?(D-p.s+.3)/Math.max(q.s-p.s,.6):D-p.s+.3,0),1);g.position.copy(T.pts[Math.min(Math.floor(b*(T.pts.length-1)),T.pts.length-1)])}g.visible=P<=H;const y=d[d.length-1];Q.position.copy(te(x,34.5,y.y+1.2)),Q.visible=H===99,Q.scale.setScalar(1+.15*Math.sin(performance.now()/300));const O=d[e.pivot];if(N.visible=H!==99&&!!O,O&&N.position.copy(te(O.to[0],O.to[1],O.y+a+3)),l.target.y+=(Math.min(p.y,y.y)+2-l.target.y)*.03,H!==99&&P>=H)return{kind:"bug",k:i("lab.call.fixK",{clock:rt(O.s)}),html:i("lab.call.forksFix",{..._,m:e.offsideBy.toFixed(1)})};if(p.type==="shot")return{kind:"goal",k:i("lab.call.goalK",{clock:rt(e.goalS)}),html:i(s.state.fix?"lab.call.goalFix":"lab.call.forksGoal",_)};if(P===e.pivot)return{kind:"bug",k:i("lab.call.passK",{clock:rt(p.s)}),html:i("lab.call.forksPass",{..._,m:e.gapAtPass.toFixed(1)})};const R=w.filter(b=>b.k===P).length,A=w.filter(b=>b.k===P&&b.better).length;return{kind:"",k:i("lab.call.touchK",{clock:rt(p.s),k:P+1,n:d.length}),html:A?i("lab.call.touchBetter",{name:tt(t,p.player),n:R,b:A}):i("lab.call.touch",{name:tt(t,p.player),n:R})}},on(){o.addEventListener("pointermove",B),lt.on()},off(){o.removeEventListener("pointermove",B),lt.off()},dispose(){l.dispose(),Fe(n)}}}function Ui(s){const{lab:t,c:e,canvas:o,mini:i,t:a}=s,n=new Re,r=document.createElement("canvas");r.width=4,r.height=256;const l=r.getContext("2d"),d=l.createLinearGradient(0,0,0,256);d.addColorStop(0,"#03050f"),d.addColorStop(.55,"#0d1850"),d.addColorStop(1,"#1a2a6c"),l.fillStyle=d,l.fillRect(0,0,4,256),n.background=qt(r),n.fog=new Vs(857669,40,160);const f=new Ne(62,1,.1,400);n.add(new Ks(13161727,727570,1.4));const c=new $s(16777215,1.6);c.position.set(-30,60,20),n.add(c),n.add(new ot(new zt(125,88).rotateX(-Math.PI/2),new re({map:qt(_e({fill:"#0e2f22",stripes:"#113726",line:"rgba(235,240,255,.85)",lw:.12,pad:10,k:16})),roughness:.95})));const w=Array.from({length:22},(u,m)=>{const h=new Oe,z=St(m)===1,E=new re({color:z?11680314:2777008,emissive:z?3804172:728644,roughness:.6}),L=new ot(new Xe(.3,.85,4,12),E);L.position.y=.95;const G=new ot(new be(.16,14,10),new re({color:14267535,roughness:.8}));G.position.y=1.68;const X=new ot(new ge(.55,20).rotateX(-Math.PI/2),new bt({color:0,transparent:!0,opacity:.4}));X.position.y=.02;const J={color:It(m),transparent:!0,blending:Wt,depthWrite:!1},nt=new ot(new cs(.9,1,48).rotateX(-Math.PI/2),new bt({...J,opacity:.55}));nt.position.y=.04;const pt=new ot(new ge(1,48).rotateX(-Math.PI/2),new bt({...J,opacity:.08}));pt.position.y=.03;const et=Ot(`${t.numbers[m]} ${tt(t,m)}`,{color:"#060918",bg:z?"#ff8a7f":"#8cbcff",size:30,h:.55});return et.position.y=2.25,h.add(L,G,X,nt,pt,et),n.add(h),{g:h,mat:E,reach:nt,disc:pt,n:et}}),g=new ot(new be(.13,16,12),new re({color:16777215,emissive:6710886})),Q=new ot(new zt(68,2.4).rotateY(Math.PI/2),new bt({color:_t.bug,transparent:!0,opacity:.1,side:Xt,depthWrite:!1,blending:Wt}));Q.position.y=1.2;const N=Tt(3,{order:3}),x=Ot(a("lab.theLine",{team:t.clubs[St(e.culprit)].name}),{color:"#1a1600",bg:"#ffd60a",size:32,h:.7}),C=new ot(new Xe(.3,.85,4,12),new bt({color:_t.bug,transparent:!0,opacity:.45})),S=Ot(a("lab.shouldBe",{name:tt(t,e.culprit)}),{color:"#1a1600",bg:"#ffd60a",size:32,h:.32});n.add(g,Q,N,x,C,S);const k=Array.from({length:10},()=>{const u=new ot(new zt(1,1).rotateX(-Math.PI/2),new bt({color:16777215,transparent:!0,depthWrite:!1,blending:Wt}));return u.position.y=.05,n.add(u),u});let M=e.culprit,B=!1,lt=0,dt=0,at=null,K=null;const D=new U,_=new U,P=new U,H=_e({line:"rgba(200,210,255,.5)",lw:.35,k:4}),p=i.getContext("2d"),q=[1,.84,.04,1,.84,.04];function T(u){const m=i.width,h=i.height,z=m/115;p.setTransform(1,0,0,1,0,0),p.clearRect(0,0,m,h),p.translate(5*z,(h-68*z)/2),p.scale(z,z),p.drawImage(H,0,0,105,68);const E=$t(e,u);p.strokeStyle="#ffd60a",p.lineWidth=.6,p.beginPath(),p.moveTo(E,0),p.lineTo(E,68),p.stroke();const L=B?u.pos[Math.max(u.carrier,0)]:u.pos[M];f.getWorldDirection(P);const G=Math.atan2(P.z,P.x);p.fillStyle="rgba(233,236,255,.14)",p.beginPath(),p.moveTo(L[0],L[1]),p.arc(L[0],L[1],30,G-.55,G+.55),p.fill(),u.pos.forEach(([X,J],nt)=>{p.fillStyle=nt===e.culprit?"#ffd60a":St(nt)?"#ff6b5e":"#6ea8ff",p.beginPath(),p.arc(X,J,nt===M&&!B?2.4:1.4,0,7),p.fill(),nt===M&&!B&&(p.strokeStyle="#fff",p.lineWidth=.5,p.stroke())}),p.fillStyle="#fff",p.beginPath(),p.arc(u.ball[0],u.ball[1],.9,0,7),p.fill()}const y=u=>{M=u,B=!1,lt=0,at=null,s.refresh()},O=u=>{const m=i.getBoundingClientRect(),h=m.width/115,z=(u.clientX-m.left)/h-5,E=(u.clientY-m.top-(m.height-68*h)/2)/h,L=Et(t,s.state.t);let G=0,X=1e9;L.pos.forEach(([J,nt],pt)=>{const et=Math.hypot(J-z,nt-E);et<X&&(X=et,G=pt)}),y(G)},R=u=>K=[u.clientX,u.clientY,lt,dt],A=u=>{K&&(lt=K[2]-(u.clientX-K[0])*.006,dt=Math.max(-.5,Math.min(.4,K[3]-(u.clientY-K[1])*.004)))},b=()=>K=null,W=tt(t,e.culprit),ht=tt(t,e.receiver),ut=e.decisions[e.pivot];return{scene:n,camera:f,controls:null,bloom:[.3,.35,.75],start:Math.max(e.dropS-9,e.t0),tools:()=>[{id:"culprit",label:a("lab.be",{name:`${W} (#${t.numbers[e.culprit]})`}),pressed:!B&&M===e.culprit,on:()=>y(e.culprit)},{id:"receiver",label:a("lab.be",{name:`${ht} (#${t.numbers[e.receiver]})`}),pressed:!B&&M===e.receiver,on:()=>y(e.receiver)},{id:"ball",label:a("lab.followBall"),pressed:B,on:()=>{B=!B,at=null}}],frame(u,m){const h=Et(t,u),z=Et(t,u+.2),E=$t(e,h),L=St(B?Math.max(h.carrier,0):M);h.pos.forEach(([j,$],F)=>{const V=w[F];V.g.position.set(j-52.5,0,$-34);const vt=z.pos[F][0]-j,Y=z.pos[F][1]-$,st=Math.hypot(vt,Y)*5;st>.2&&(V.g.rotation.y=Math.atan2(-Y,vt));const xt=B?99:Math.hypot(j-h.pos[M][0],$-h.pos[M][1]);V.g.visible=B||F!==M&&xt>1.2,V.n.visible=xt>6;const yt=1.2+st*.45;V.reach.scale.setScalar(yt),V.disc.scale.setScalar(yt),V.reach.visible=V.disc.visible=St(F)!==L,V.mat.emissive.set(F===e.culprit?4864512:St(F)?3804172:728644),V.n.material.opacity=F===e.culprit||F===e.receiver||F===h.carrier?1:.7}),g.position.set(h.ball[0]-52.5,.13,h.ball[1]-34),Q.position.set(E-52.5,1.2,0),kt(N,[E-52.5,2.4,-34,E-52.5,2.4,34],q),x.position.set(E-52.5,3.1,h.pos[e.culprit][1]-34+6);const G=Math.max(h.carrier,0),X=St(G);let J=0,nt=0;for(let j=X*11+1;j<X*11+11;j++){if(j===G||J>=k.length)continue;const $=k[J++],F=h.pos[G],V=h.pos[j],vt=X===e.attack?ie(e,F,V,h):.3;vt>.5&&nt++,$.scale.set(Math.hypot(V[0]-F[0],V[1]-F[1]),1,.5+vt*.9),$.position.set((F[0]+V[0])/2-52.5,.05,(F[1]+V[1])/2-34),$.rotation.y=-Math.atan2(V[1]-F[1],V[0]-F[0]),$.material.color.copy(It(G)),$.material.opacity=.03+.32*vt*vt}for(;J<k.length;J++)k[J].material.opacity=0;const pt=Bt(e,h);if(C.visible=S.visible=s.state.fix&&pt>.8,C.position.set(ye(e,h)-52.5,.95,h.pos[e.culprit][1]-34),S.position.set(ye(e,h)-52.5,2.05,h.pos[e.culprit][1]-34),B){const j=h.pos[G],$=X===0?1:-1;D.set(j[0]-52.5-$*9,4.5,j[1]-34+2),_.set(j[0]-52.5+$*12,.5,j[1]-34),f.position.lerp(D,at===null?1:.08),at=0,f.lookAt(_)}else{const j=h.pos[M];f.position.set(j[0]-52.5,1.7,j[1]-34);const $=Math.atan2(h.ball[1]-j[1],h.ball[0]-j[0]);at===null&&(at=$);const F=Math.atan2(Math.sin($-at),Math.cos($-at));at+=F*Math.min(1,m*3),K||(lt*=1-Math.min(1,m*.8),dt*=1-Math.min(1,m*.8));const V=at+lt,vt=-.06+dt;f.lookAt(f.position.x+Math.cos(V)*Math.cos(vt),1.7+Math.sin(vt),f.position.z+Math.sin(V)*Math.cos(vt))}T(h);const et={name:W,receiver:ht,scorer:tt(t,e.scorer),trials:e.trials,base:e.baseline,fixed:e.fixed},Lt=B?a("lab.call.ballK",{clock:rt(u)}):a("lab.call.youK",{name:tt(t,M),clock:rt(u)});if(u>=e.goalS)return{kind:"goal",k:a("lab.call.goalK",{clock:rt(e.goalS)}),html:a(s.state.fix?"lab.call.eyesGoalFix":"lab.call.eyesGoal",et)};if(!B&&M===e.culprit&&pt>.8)return{kind:"bug",k:Lt,html:a(ut&&u>=ut.s-1?"lab.call.youCulpritLate":"lab.call.youCulprit",{...et,m:pt.toFixed(1)})};if(!B&&M===e.receiver){const j=Zt(e,h),$=h.pos[M][0],F=pt>.8&&Qt(e,j,$,h.ball[0])&&!Qt(e,h,$,h.ball[0]);return{kind:F?"bug":"",k:Lt,html:F?a("lab.call.youReceiverOff",{...et,m:Math.abs(ve(e,h)-$).toFixed(1)}):a("lab.call.youReceiver")}}return{kind:"",k:Lt,html:a("lab.call.lanes",{open:nt,n:10})}},on(){i.hidden=!1,o.addEventListener("pointerdown",R),addEventListener("pointermove",A),addEventListener("pointerup",b),i.addEventListener("click",O)},off(){i.hidden=!0,o.removeEventListener("pointerdown",R),removeEventListener("pointermove",A),removeEventListener("pointerup",b),i.removeEventListener("click",O)},dispose(){Fe(n)}}}function zi(s){const{lab:t,c:e,canvas:o,t:i}=s,a=40;let n=30,r=-1;const l=new Re;l.fog=new ls(gs,.0042);const d=new Ne(38,1,.5,900);d.position.set(-84*e.sgn,46,104);const f=new fs(d,o);f.target.set(8*e.sgn,-12,0),f.enableDamping=!0,f.minDistance=40,f.maxDistance=320;const c=new ot(new zt(105,68).rotateX(-Math.PI/2),new bt({map:qt(_e({line:"rgba(214,224,255,.85)",lw:.16})),transparent:!0,depthWrite:!1})),w=new ot(new zt(109,72).rotateX(-Math.PI/2),new bt({color:1714810,transparent:!0,opacity:.28,depthWrite:!1,side:Xt}));w.position.y=-.05,c.renderOrder=5,w.renderOrder=4,l.add(w,c);const g=new Oe;l.add(g);const Q=new Zs({color:2568814,transparent:!0,opacity:.8}),N=[[-54.5,-36],[54.5,-36],[54.5,36],[-54.5,36]];function x(){for(const m of[...g.children])g.remove(m),m.geometry?.dispose(),m instanceof rs&&(m.material.map?.dispose(),m.material.dispose());for(const[m,h]of N)g.add(new Qs(new ee().setFromPoints([new U(m,0,h),new U(m,-a,h)]),Q));const u=n<=30?5:10;for(let m=u;m<=n+.01;m+=u){const h=-(m/n)*a;g.add(new qs(new ee().setFromPoints(N.map(([E,L])=>new U(E,h,L))),Q));const z=Ot(i("lab.sAgo",{s:m}),{color:"#8f97c8",bg:null,size:34,h:2.2,bold:!1});z.position.set(-54.5*e.sgn,h+1.2,38.5),g.add(z)}}x();const C=Array.from({length:22},()=>Tt(1.7));l.add(...C);const S=Tt(3.4,{order:3}),k=Tt(2.6,{dashed:!0,dash:1.4,gap:1,order:3}),M=Tt(1.4),B=Tt(1.4);l.add(S,k,M,B);const lt=new ot(new ee,new bt({color:_t.bug,transparent:!0,opacity:.13,depthWrite:!1,side:Xt,blending:Wt}));lt.frustumCulled=!1,l.add(lt);const dt=Array.from({length:22},(u,m)=>{const h=new ot(new ge(1.05,28).rotateX(-Math.PI/2),new bt({color:It(m),transparent:!0}));return h.renderOrder=6,l.add(h),h}),at=dt.map((u,m)=>{const h=Ot(String(t.numbers[m]),{color:"#060918",bg:St(m)?"#ff6b5e":"#6ea8ff",size:30,h:1.9});return l.add(h),h}),K=new ot(new be(.75,20,14),new bt({color:16777215})),D=Tt(4,{order:7}),_=Ot(" ",{color:"#1a1600",bg:"#ffd60a",size:34,h:3.6}),P=Ot(i("lab.offsideFix"),{color:"#1a1600",bg:"#ffd60a",size:34,h:3.6}),H=Tt(2.4,{dashed:!0,dash:1.6,gap:1.2,order:7});l.add(K,D,_,P,H);const p=e.decisions[e.pivot],q=[],T=new At,y=[1,.84,.04,1,.84,.04];function O(u){const h=Array.from({length:22},()=>[]),z=Array.from({length:22},()=>[]),E=[],L=[],G=[],X=[],J=[],nt=[],pt=[],et=[];q.length=0;for(let Y=0;Y<150;Y++){const st=Y/149*n,xt=Math.max(u-st,e.t0),yt=-(st/n)*a,ae=Math.pow(1-Y/149,1.15)*.92+.08,jt=Et(t,xt),ne=$t(e,jt),Ie=Bt(e,jt);for(let Mt=0;Mt<22;Mt++){const[He,Ge]=jt.pos[Mt];h[Mt].push(He-52.5,yt,Ge-34),T.copy(It(Mt)),Mt===e.culprit&&Ie>.8&&T.lerp(_t.bug,Math.min(1,(Ie-.8)/1.6));const _s=r<0||r===Mt?1:.13;T.multiplyScalar(ae*_s*(Mt===e.culprit||Mt===e.receiver?1.25:.85)),z[Mt].push(T.r,T.g,T.b),Y%3===0&&q.push([Mt,He-52.5,yt,Ge-34,xt])}E.push(jt.ball[0]-52.5,yt+.02,jt.ball[1]-34),T.copy(_t.ball).lerp(jt.team?_t.away:_t.home,.3).multiplyScalar(.3+.9*ae*(r<0?1:.5)),L.push(T.r,T.g,T.b),G.push(ne-52.5,yt,-34,ne-52.5,yt,34),nt.push(ne-52.5,yt,-34),pt.push(ne-52.5,yt,34),T.copy(_t.bug).multiplyScalar(ae*.8),et.push(T.r,T.g,T.b),X.push(ye(e,jt)-52.5,yt+.03,jt.pos[e.culprit][1]-34),T.set(16777215).lerp(_t.bug,.4).multiplyScalar(ae),J.push(T.r,T.g,T.b)}C.forEach((Y,st)=>kt(Y,h[st],z[st])),kt(S,E,L),kt(M,nt,et),kt(B,pt,et);const Lt=[];for(let Y=0;Y<149;Y++){const st=2*Y;Lt.push(st,st+1,st+2,st+1,st+3,st+2)}lt.geometry.dispose(),lt.geometry=new ee,lt.geometry.setAttribute("position",new se(G,3)),lt.geometry.setIndex(Lt),k.visible=s.state.fix,s.state.fix&&kt(k,X,J);const j=Et(t,u),$=$t(e,j),F=Bt(e,j);j.pos.forEach(([Y,st],xt)=>{dt[xt].position.set(Y-52.5,.06,st-34),at[xt].position.set(Y-52.5,2.2,st-34),dt[xt].material.opacity=at[xt].material.opacity=r<0||r===xt?1:.25}),dt[e.culprit].material.color.copy(F>.8?_t.bug:It(e.culprit)),K.position.set(j.ball[0]-52.5,.8,j.ball[1]-34);const V=F>.8;if(D.visible=_.visible=V,V){const Y=j.pos[e.culprit][1]-34;kt(D,[$-52.5,.3,Y,j.pos[e.culprit][0]-52.5,.3,Y],y),Oi(_,i("lab.behind",{m:F.toFixed(1)})),_.position.set(($+j.pos[e.culprit][0])/2-52.5,5,Y)}const vt=!!p&&u>=p.s-1.5&&u<=p.s+6;if(P.visible=H.visible=s.state.fix&&vt,s.state.fix&&vt&&p){const Y=Et(t,p.s-.5),st=ve(e,Zt(e,Y)),xt=-((u-p.s)/n)*a;kt(H,[st-52.5,xt+.2,-34,st-52.5,xt+.2,34],y);const yt=Y.pos[e.receiver];P.visible=Qt(e,Zt(e,Y),yt[0],p.from[0]),P.position.set(yt[0]-52.5,xt+9,yt[1]-34)}return F}const R=u=>{const m=o.getBoundingClientRect(),h=u.clientX-m.left,z=u.clientY-m.top;let E=null,L=14;for(const[G,X,J,nt,pt]of q){const[et,Lt]=xs(new U(X,J,nt),d,o),j=Math.hypot(et-h,Lt-z);j<L&&(L=j,E=[G,pt,et,Lt])}return E},A=u=>{const m=R(u);if(!m)return s.untag();const[h,z,E,L]=m,G=i("lab.tagSub",{club:t.clubs[St(h)].name,role:i(`lab.role.${t.roles[h]}`,{defaultValue:""}),clock:rt(z)});s.tag(E,L,`${Ae(t,h)}<small>${G}${h===e.culprit?` · ${i("lab.culpritTag")}`:""}</small>`)},b=ys(o,u=>{const m=R(u),h=m?m[0]:-1;r=h===r?-1:h}),W=tt(t,e.culprit),ht=tt(t,e.receiver),ut=t.clubs[St(e.culprit)].name;return{scene:l,camera:d,controls:f,bloom:[.75,.55,.12],start:Math.max(e.dropS-12,e.t0),tools:()=>[{id:"depth",label:i("lab.depth",{s:n}),on:()=>{n=n===30?60:n===60?15:30,x()}},{id:"side",label:i("lab.sideView"),on:()=>{d.position.set(0,-14,150),f.target.set(0,-16,0)}},{id:"top",label:i("lab.topView"),on:()=>{d.position.set(0,140,1),f.target.set(0,-10,0)}}],frame(u){const m=O(u),h={name:W,receiver:ht,team:ut,scorer:tt(t,e.scorer),trials:e.trials,base:e.baseline,fixed:e.fixed};return u>=e.goalS?{kind:"goal",k:i("lab.call.goalK",{clock:rt(e.goalS)}),html:i(s.state.fix?"lab.call.goalFix":"lab.call.goal",h)}:p&&u>=p.s-.5?{kind:"bug",k:i("lab.call.passK",{clock:rt(p.s)}),html:s.state.fix?i("lab.call.passFix",{...h,m:e.offsideBy.toFixed(1)}):i("lab.call.pass",{...h,m:Math.max(m,e.gapAtPass).toFixed(1)})}:m>.8?{kind:"bug",k:i("lab.call.mistakeK"),html:i("lab.call.mistake",h)}:{kind:"",k:rt(u),html:i("lab.call.calm",h)}},on(){o.addEventListener("pointermove",A),b.on()},off(){o.removeEventListener("pointermove",A),b.off()},dispose(){f.dispose(),Fe(l)}}}const Pe=[{id:"column",make:zi},{id:"forks",make:ji},{id:"eyes",make:Ui}],Ce=[1,.5,2];function Ii(){const{t:s}=hs(),t=gi(),e=Js(),o=it.useMemo(()=>t.data?e.traces.map(r=>bi(t.data,r)).filter(r=>r!==null).sort((r,l)=>r.goalS-l.goalS):[],[t.data,e.traces]),[i,a]=it.useState(0),n=o[Math.min(i,o.length-1)];return v.jsxs("section",{className:"mx-auto w-full max-w-[1320px] px-4 pb-16 pt-8 sm:px-8",children:[v.jsxs("div",{className:"mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4",children:[v.jsxs("div",{className:"max-w-[640px]",children:[v.jsx("p",{className:"text-[12px] font-bold uppercase tracking-[0.16em] text-flare",children:s("lab.eyebrow")}),v.jsx("h1",{className:"mt-1 text-balance font-display text-[34px] font-black leading-[0.95] tracking-display [font-stretch:125%] sm:text-[48px]",children:s("lab.title")}),v.jsx("p",{className:"mt-3 text-[16px] text-chalk-dim",children:s("lab.lede")})]}),t.data&&o.length>1&&v.jsx("div",{role:"group","aria-label":s("lab.goalsLabel"),className:"flex flex-wrap gap-2",children:o.map((r,l)=>v.jsx("button",{type:"button","aria-pressed":r===n,onClick:()=>a(l),className:"rc-press rounded-full border border-turf-edge px-4 py-2 text-[14px] font-semibold text-chalk-dim aria-pressed:border-chalk aria-pressed:bg-chalk aria-pressed:text-ink",children:s("lab.goalChip",{clock:rt(r.goalS),name:tt(t.data,r.scorer)})},r.id))})]}),t.error?v.jsx("p",{className:"rounded-panel bg-turf px-6 py-16 text-center text-[17px] text-chalk-dim",children:s("lab.failed")}):!t.data||e.loading?v.jsx("div",{className:"relative h-[min(76vh,720px)] min-h-[460px] animate-pulse rounded-panel bg-[#0a1240]",children:v.jsx("p",{className:"absolute left-6 top-6 text-[15px] text-chalk-dim",children:s("lab.loading")})}):n?v.jsx(Bi,{lab:t.data,c:n},n.id):v.jsx("p",{className:"rounded-panel bg-turf px-6 py-16 text-center text-[17px] text-chalk-dim",children:s("lab.noTrace")})]})}function Bi({lab:s,c:t}){const{t:e}=hs(),o=ti(y=>y.reducedMotion),[i,a]=it.useState(()=>{try{return Math.min(Number(localStorage.getItem("rc.labView")??0)||0,2)}catch{return 0}}),[,n]=it.useReducer(y=>y+1,0),[r,l]=it.useState(!o),[d,f]=it.useState(1),[c,w]=it.useState(!1),[g,Q]=it.useState(!1),N=it.useRef({t:t.t0,fix:!1,playing:!o,speed:1}),x=it.useRef(null),C=it.useRef(null),S=it.useRef(null),k=it.useRef(null),M=it.useRef(null),B=it.useRef(null),lt=it.useRef(null),dt=it.useRef(null),at=it.useRef(null),K=it.useRef(null);N.current.playing=r,N.current.speed=d,N.current.fix=c,it.useEffect(()=>{const y=C.current,O=x.current;let R;try{R=new ei({canvas:y,antialias:!0,powerPreference:"high-performance"})}catch{Q(!0);return}R.setPixelRatio(Math.min(devicePixelRatio,2)),R.toneMapping=os,K.current={renderer:R,composer:null,view:null};const A=()=>{const m=O.getBoundingClientRect();R.setSize(m.width,m.height,!1);const h=K.current;h?.view&&(h.view.camera.aspect=m.width/Math.max(m.height,1),h.view.camera.updateProjectionMatrix()),h?.composer?.setSize(m.width,m.height)},b=new ResizeObserver(A);b.observe(O);let W=0,ht=performance.now(),ut="";const u=m=>{W=requestAnimationFrame(u);const h=K.current,z=Math.min((m-ht)/1e3,.1);if(ht=m,!h?.view||!h.composer)return;const E=N.current;E.playing&&(E.t+=z*E.speed,E.t>t.t1&&(E.t=h.view.start));const L=h.view.frame(E.t,z);h.view.controls?.update(),h.composer.render();const G=L.kind+L.k+L.html;G!==ut&&M.current&&(ut=G,M.current.dataset.kind=L.kind,M.current.innerHTML=`<span class="lab-k">${L.k}</span>${L.html}`);const X=(E.t-t.t0)/(t.t1-t.t0);lt.current&&(lt.current.style.width=`${X*100}%`),dt.current&&(dt.current.style.left=`${X*100}%`),at.current&&document.activeElement!==at.current&&(at.current.value=String(E.t)),B.current&&(B.current.textContent=rt(E.t))};return W=requestAnimationFrame(u),()=>{cancelAnimationFrame(W),b.disconnect(),R.dispose(),K.current=null}},[t]),it.useEffect(()=>{const y=K.current;if(!y)return;const O={lab:s,c:t,canvas:C.current,mini:S.current,t:e,state:N.current,tag:(W,ht,ut)=>{const u=k.current;u&&(u.hidden=!1,u.style.left=`${W}px`,u.style.top=`${ht}px`,u.innerHTML=ut)},untag:()=>{k.current&&(k.current.hidden=!0)},seek:W=>{N.current.t=Math.min(Math.max(W,t.t0),t.t1),l(!1)},refresh:n},R=Pe[i].make(O),A=x.current.getBoundingClientRect();R.camera.aspect=A.width/Math.max(A.height,1),R.camera.updateProjectionMatrix();const b=new ri(y.renderer);b.addPass(new hi(R.scene,R.camera)),b.addPass(new Kt(new Z(A.width,A.height),...R.bloom)),b.addPass(new ci),b.setSize(A.width,A.height),N.current.t=R.start,y.view=R,y.composer=b,R.on(),n();try{localStorage.setItem("rc.labView",String(i))}catch{}return()=>{R.off(),R.dispose(),b.dispose(),K.current&&(K.current.view=null,K.current.composer=null),k.current&&(k.current.hidden=!0)}},[i,t,s,e]);const D=K.current?.view?.tools()??[],_=t.decisions[t.pivot],P=y=>`${(y-t.t0)/(t.t1-t.t0)*100}%`,H=[{s:t.dropS,cls:"text-flare",text:e("lab.marks.drop",{name:tt(s,t.culprit)})},..._?[{s:_.s,cls:"text-flare",text:e("lab.marks.pass")}]:[],{s:t.goalS,cls:"text-chalk",text:e("lab.marks.goal")}],p=Pe[i].id,q={name:tt(s,t.culprit),receiver:tt(s,t.receiver),team:s.clubs[t.culprit<11?0:1].name,at:rt(t.dropS),pass:rt(_?_.s:t.goalS),m:(_?t.gapAtPass:t.maxGap).toFixed(1)},T=_?"":"Open";return v.jsxs("div",{className:"grid gap-4",children:[v.jsx("div",{role:"tablist","aria-label":e("lab.viewsLabel"),className:"flex flex-wrap gap-2",children:Pe.map((y,O)=>v.jsxs("button",{role:"tab",type:"button","aria-selected":O===i,onClick:()=>a(O),className:"rc-press flex items-center gap-2 rounded-full border border-turf-edge px-4 py-2.5 text-[15px] font-semibold text-chalk-dim aria-selected:border-[#060918] aria-selected:bg-[#060918] aria-selected:text-chalk",children:[v.jsx("span",{className:`font-display text-[12px] font-black [font-stretch:140%] ${O===i?"text-flare":"text-chalk-faint"}`,children:"ABC"[O]}),e(`lab.views.${y.id}`)]},y.id))}),v.jsxs("div",{ref:x,className:"relative h-[min(76vh,720px)] min-h-[520px] touch-none select-none overflow-hidden rounded-panel border border-[#222b5c] bg-[radial-gradient(120%_90%_at_50%_0%,#10194a_0%,#060918_62%)]",children:[v.jsx("canvas",{ref:C,role:"img","aria-label":e("lab.stageLabel"),className:"absolute inset-0 block h-full w-full cursor-grab active:cursor-grabbing"}),g&&v.jsx("p",{className:"absolute inset-0 grid place-items-center px-6 text-center text-[16px] text-chalk-dim",children:e("lab.noGl")}),v.jsxs("div",{className:"pointer-events-none absolute left-4 top-4 grid max-w-[min(440px,60%)] gap-1 sm:left-5",children:[v.jsx("span",{className:"text-[11px] font-bold uppercase tracking-[0.16em] text-flare",children:e(`lab.kicker.${p}`)}),v.jsx("h2",{className:"font-display text-[30px] font-black leading-[0.92] tracking-display [font-stretch:135%] sm:text-[48px]",children:e(`lab.views.${p}`)}),v.jsx("p",{className:"mt-1 hidden max-w-[34ch] text-[14px] text-[#8f97c8] sm:block",children:e(`lab.viewLine.${p}`)})]}),v.jsxs("div",{className:"absolute right-3 top-3 flex flex-col items-end gap-1.5 sm:right-4 sm:top-4",children:[v.jsx("button",{type:"button","aria-pressed":c,onClick:()=>w(!c),className:"rc-press rounded-full border border-flare/60 bg-[#0d1330]/80 px-3.5 py-2 text-[13px] font-semibold text-flare backdrop-blur aria-pressed:border-flare aria-pressed:bg-flare aria-pressed:text-flare-ink",children:e("lab.showFix")}),D.map(y=>v.jsx("button",{type:"button","aria-pressed":y.pressed,onClick:()=>{y.on(),n()},className:"rc-press rounded-full border border-[#222b5c] bg-[#0d1330]/80 px-3.5 py-2 text-[13px] font-semibold text-chalk backdrop-blur aria-pressed:border-chalk aria-pressed:bg-chalk aria-pressed:text-ink",children:y.label},y.id))]}),v.jsx("div",{ref:M,"aria-live":"polite",className:"lab-callout pointer-events-none absolute bottom-[74px] left-4 max-w-[min(460px,calc(100%-32px))] rounded-[10px] border border-l-[3px] border-[#222b5c] bg-[#060918]/85 px-3.5 py-2.5 text-[14.5px] backdrop-blur sm:left-5"}),v.jsx("canvas",{ref:S,width:420,height:272,hidden:!0,"aria-label":e("lab.miniLabel"),className:"absolute bottom-[172px] right-3 h-[91px] w-[140px] cursor-pointer rounded-lg border border-[#222b5c] bg-[#060918]/85 sm:bottom-[74px] sm:right-4 sm:h-[136px] sm:w-[210px]"}),v.jsx("div",{ref:k,hidden:!0,className:"lab-tag pointer-events-none absolute translate-x-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-chalk px-2.5 py-1.5 text-[13px] font-semibold leading-snug text-ink"}),v.jsxs("div",{className:"absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-b from-transparent to-[#060918]/95 px-4 pb-3.5 pt-3",children:[v.jsx("button",{type:"button",onClick:()=>l(!r),"aria-label":e(r?"lab.pause":"lab.play"),className:"rc-press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-chalk text-ink",children:r?v.jsxs("svg",{width:"12",height:"12",viewBox:"0 0 12 12","aria-hidden":"true",children:[v.jsx("rect",{x:"1.5",y:"1",width:"3",height:"10",fill:"currentColor"}),v.jsx("rect",{x:"7.5",y:"1",width:"3",height:"10",fill:"currentColor"})]}):v.jsx("svg",{width:"12",height:"12",viewBox:"0 0 12 12","aria-hidden":"true",children:v.jsx("path",{d:"M2.5 1 L11 6 L2.5 11 Z",fill:"currentColor"})})}),v.jsx("span",{ref:B,className:"min-w-[54px] font-display text-[18px] font-extrabold tabular-nums [font-stretch:120%]",children:rt(t.t0)}),v.jsxs("div",{className:"relative h-9 min-w-0 flex-1",children:[v.jsx("div",{className:"pointer-events-none absolute inset-x-0 top-[17px] h-[3px] rounded bg-[#222b5c]"}),v.jsx("div",{ref:lt,className:"pointer-events-none absolute left-0 top-[17px] h-[3px] rounded bg-chalk"}),v.jsx("div",{ref:dt,className:"pointer-events-none absolute top-[11px] -ml-[7px] h-[15px] w-[15px] rounded-full bg-chalk shadow-[0_0_0_4px_rgba(233,236,255,.15)]"}),H.map(y=>v.jsxs("div",{className:`pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.08em] ${y.cls}`,style:{left:P(y.s)},children:[v.jsx("span",{className:"hidden sm:inline",children:y.text}),v.jsx("i",{className:"absolute left-1/2 top-[13px] -ml-px h-[11px] w-[2px] bg-current"})]},y.text)),v.jsx("input",{ref:at,type:"range",min:t.t0,max:t.t1,step:.05,defaultValue:t.t0,"aria-label":e("lab.time"),onChange:y=>{N.current.t=+y.target.value},className:"absolute inset-0 m-0 w-full cursor-pointer opacity-0"})]}),v.jsxs("button",{type:"button",onClick:()=>f(Ce[(Ce.indexOf(d)+1)%Ce.length]),"aria-label":e("lab.speed"),className:"rc-press h-9 min-w-9 shrink-0 rounded-full border border-[#222b5c] px-3 text-[13px] font-bold text-chalk",children:[d,"×"]})]})]}),v.jsx("div",{className:"grid gap-3 md:grid-cols-3",children:["see","mistake","fix"].map(y=>v.jsxs("div",{className:"min-w-0 rounded-panel border border-[#222b5c] bg-[#0d1330] px-4 py-3.5",children:[v.jsx("h3",{className:`text-[11px] font-bold uppercase tracking-[0.14em] ${y==="mistake"?"text-flare":"text-[#8f97c8]"}`,children:e(`lab.notesHead.${y}`)}),v.jsx("p",{className:"mt-1 text-[15px]",children:e(`lab.notes.${p}.${y}${y==="see"?"":T}`,q)})]},y))}),v.jsx("p",{className:"text-[13px] text-chalk-faint",children:e("lab.foot",{home:s.clubs[0].name,away:s.clubs[1].name})})]})}export{Ii as Lab};

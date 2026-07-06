// AURADIN — orb GLSL, verbatim from the DS web original (components/orb/Orb.jsx,
// the squishy iridescent blob in "AppScreen copy copy.dc.html") via the
// AuradinRN 2 port. Framework-free strings; OrbGLCanvas owns the three scene.
//
// WebGL1 / GLSL ES 1.00 / three r128: no #version, no in/out, gl_FragColor;
// position/normal/matrices come from three's injected prefix.

/** Ashima simplex noise — prepended to both blob shaders. */
export const NOISE = `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 hh=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(hh,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,hh.x);vec3 p1=vec3(a0.zw,hh.y);vec3 p2=vec3(a1.xy,hh.z);vec3 p3=vec3(a1.zw,hh.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }`;

/**
 * Blob vertex: simplex displacement + touch ripples + squishy grab-drag.
 * The ripple/drag uniforms stay at rest values in the app (the persistent orb
 * is pointerEvents="none") — the shader is kept verbatim so interaction can be
 * enabled later without touching GLSL.
 */
export const BLOB_VERT = `
  uniform float uTime; uniform vec2 uPointer; uniform float uStrength; uniform vec2 uDrag;
  uniform vec4 uRipples[4]; uniform vec3 uGrab; uniform vec3 uDragL;
  varying vec3 vN; varying vec3 vV; varying float vD; varying float vRip;
  float disp(vec3 p){
    float t=uTime*0.28;
    float d=snoise(p*0.65+vec3(t,t*0.6,t*0.45))*0.085;
    d+=snoise(p*1.1+vec3(-t*0.4,t*0.5,t*0.3))*0.042;
    return d;
  }
  void main(){
    float d=disp(normal);
    float rip=0.0; float ripGlow=0.0;
    for(int i=0;i<4;i++){
      float st=uRipples[i].w;
      float age=uTime-st;
      if(st>0.0 && age>0.0 && age<3.0){
        float gd=acos(clamp(dot(normalize(position),normalize(uRipples[i].xyz)),-1.0,1.0));
        float fade=exp(-age*1.1)*(1.0-smoothstep(2.2,3.0,age));
        float w=sin(gd*14.0-age*2.6)*exp(-gd*2.2)*fade;
        rip+=w*0.032;
        ripGlow+=abs(w)*exp(-age*0.9)*(1.0-smoothstep(2.2,3.0,age));
      }
    }
    vec3 pos=position+normal*(d+rip);
    vRip=ripGlow;
    float dragMag=length(uDragL);
    if(dragMag>0.0001){
      float gdg=acos(clamp(dot(normalize(position),normalize(uGrab)),-1.0,1.0));
      float w=exp(-gdg*gdg*1.6);
      pos+=uDragL*w*0.55;
    }
    float e=0.12;
    vec3 t1=normalize(cross(normal,vec3(0.0,1.0,0.001)));
    vec3 t2=normalize(cross(normal,t1));
    vec3 nA=normalize(normal+t1*e); vec3 nB=normalize(normal+t2*e);
    vec3 pA=nA*(1.0+disp(nA)); vec3 pB=nB*(1.0+disp(nB)); vec3 pC=normal*(1.0+d);
    vN=normalize(cross(pA-pC,pB-pC));
    if(dot(vN,normal)<0.0) vN=-vN;
    vec4 mv=modelViewMatrix*vec4(pos,1.0);
    vV=normalize(-mv.xyz); vD=d;
    gl_Position=projectionMatrix*mv;
  }`;

/** Blob fragment: fresnel iridescence over the lavender→pink→teal→cyan→gold wheel. */
export const BLOB_FRAG = `
  uniform float uTime; uniform float uGlow;
  varying vec3 vN; varying vec3 vV; varying float vD; varying float vRip;
  vec3 palette(float h){
    vec3 lav=vec3(0.78,0.72,0.98);
    vec3 pnk=vec3(0.95,0.45,0.80);
    vec3 tea=vec3(0.45,0.92,0.82);
    vec3 cya=vec3(0.45,0.80,0.98);
    vec3 gld=vec3(0.98,0.85,0.58);
    float s=fract(h)*5.0;
    if(s<1.0) return mix(lav,pnk,smoothstep(0.0,1.0,s));
    if(s<2.0) return mix(pnk,tea,smoothstep(0.0,1.0,s-1.0));
    if(s<3.0) return mix(tea,cya,smoothstep(0.0,1.0,s-2.0));
    if(s<4.0) return mix(cya,gld,smoothstep(0.0,1.0,s-3.0));
    return mix(gld,lav,smoothstep(0.0,1.0,s-4.0));
  }
  void main(){
    vec3 n=normalize(vN); vec3 v=normalize(vV);
    float fres=pow(1.0-max(dot(n,v),0.0),2.2);
    float swirl=snoise(vec3(n.xy*1.6,uTime*0.12))*0.30+snoise(vec3(n.yx*3.2,uTime*0.07))*0.12;
    float hue=n.x*0.28+n.y*0.2+vD*1.4+uTime*0.045+swirl+vRip*1.4;
    fres=min(fres+vRip*0.55,1.0);
    vec3 iri=palette(hue);
    vec3 L=normalize(vec3(0.5,0.8,0.6));
    float spec=pow(max(dot(reflect(-L,n),v),0.0),60.0);
    float diff=max(dot(n,L),0.0);
    vec3 L2=normalize(vec3(-0.6,-0.3,0.8));
    float spec2=pow(max(dot(reflect(-L2,n),v),0.0),90.0);
    float inner=pow(max(dot(n,v),0.0),2.5);
    vec3 iri2=palette(hue+0.28);
    vec3 deep=mix(iri*0.92,vec3(0.88,0.84,0.97),0.25);
    vec3 col=mix(deep,iri,inner*0.8);
    vec3 rim=mix(iri2,vec3(1.0),0.22);
    col=mix(col,rim,fres*0.8)+vec3(1.0,0.94,1.0)*spec*0.75+iri2*spec2*0.85+iri*diff*0.25;
    col+=vec3(0.88,0.28,0.61)*uGlow*(0.25+fres*0.55);
    float alpha=0.82+fres*0.14+spec*0.25+uGlow*0.12;
    gl_FragColor=vec4(col,min(alpha,0.97));
  }`;

/** Scene/animation constants (JS side — mirrors the web original's timeline). */
export const ORB_ANIM = {
  CAMERA_FOV: 35,
  CAMERA_Z: 3, // box framing — the Animated PersistentOrb container does phase scaling
  BLOB_RADIUS: 0.43,
  BLOB_DETAIL: 48, // ~48k faces; drop to 32 for low-end Android
  GLOW_LERP: 0.04,
  ROTATE_SPEED: 0.07, // rad/s around y
  FLOAT_FREQ: 0.7,
  FLOAT_AMP: 0.02,
  // volume-preserving jelly boing — two stacked sines (freq, amplitude)
  BOING_A: { freq: 1.4, amp: 0.035 },
  BOING_B: { freq: 0.53, amp: 0.02 },
} as const;

let staticPath="./static/";var engine;async function buildScene(){var n=document.createElement("canvas"),n=(document.body.appendChild(n),(engine=new FlexLight(n)).io="web",engine.camera),e=engine.scene,a=await e.textureFromRME([1,0,0],1,1),a=(e.pbrTextures.push(a),[n.x,n.y,n.z]=[4.5,10,-7],[n.fx,n.fy]=[0,.85],e.Plane([-50,0,-50],[50,0,-50],[50,0,50],[-50,0,50])),n=(a.color=[8,64,126],e.Bounding([e.Bounding([e.Bounding([e.Plane([0,1,0],[1,1,0],[2,1,4],[1,1,4]),e.Plane([0,1,0],[0,0,0],[3,0,0],[3,1,0]),e.Plane([4,1,4],[4,0,4],[1,0,4],[1,1,4]),e.Plane([1,0,4],[0,0,0],[0,1,0],[1,1,4]),e.Plane([1,0,0],[2,0,4],[2,1,4],[1,1,0])]),e.Bounding([e.Plane([1.75,1,3],[1.75,0,3],[4,0,3],[4,1,3]),e.Plane([4,1,3],[4,1,4],[2,1,4],[1.75,1,3])])]),e.Bounding([e.Bounding([e.Plane([1.375,1,1.5],[1.375,0,1.5],[3.375,0,1.5],[3.375,1,1.5]),e.Plane([3.625,1,2.5],[3.625,0,2.5],[1.625,0,2.5],[1.635,1,2.5]),e.Plane([3.375,1,1.5],[3.625,1,2.5],[1.625,1,2.5],[1.375,1,1.5]),e.Plane([3.375,0,1.5],[3.625,0,2.5],[3.625,1,2.5],[3.375,1,1.5])]),e.Bounding([e.Plane([3.25,1,1],[3.25,0,1],[1.25,0,1],[1.25,1,1]),e.Plane([3,1,0],[3.25,1,1],[1.25,1,1],[1,1,0]),e.Plane([3,0,0],[3.25,0,1],[3.25,1,1],[3,1,0])])])])),l=e.Bounding([e.Bounding([e.Plane([4,1,3],[4,0,3],[7,0,3],[7,1,3]),e.Plane([7,1,4],[7,0,4],[4,0,4],[4,1,4]),e.Plane([7,1,3],[7,1,4],[4,1,4],[4,1,3])]),e.Bounding([e.Plane([4,1,0],[5,1,0],[5.75,1,3],[4.75,1,3]),e.Plane([4,1,0],[4,0,0],[5,0,0],[5,1,0]),e.Plane([4.75,0,3],[4,0,0],[4,1,0],[4.75,1,3]),e.Plane([5,0,0],[5.75,0,3],[5.75,1,3],[5,1,0])])]),i=e.Bounding([e.Bounding([e.Plane([8,1,4],[8,0,4],[7,0,4],[7,1,4]),e.Plane([6,1,0],[7,1,0],[8,1,4],[7,1,4]),e.Plane([6,1,0],[6,0,0],[7,0,0],[7,1,0]),e.Plane([7,0,4],[6,0,0],[6,1,0],[7,1,4]),e.Plane([7,0,0],[8,0,4],[8,1,4],[7,1,0])]),e.Bounding([e.Plane([7.375,1,1.5],[7.375,0,1.5],[8.375,0,1.5],[8.375,1,1.5]),e.Plane([8.625,1,2.5],[8.625,0,2.5],[7.625,0,2.5],[7.635,1,2.5]),e.Plane([8.375,1,1.5],[8.625,1,2.5],[7.625,1,2.5],[7.375,1,1.5])]),e.Bounding([e.Plane([10,1,4],[10,0,4],[9,0,4],[9,1,4]),e.Plane([8,1,0],[9,1,0],[10,1,4],[9,1,4]),e.Plane([8,1,0],[8,0,0],[9,0,0],[9,1,0]),e.Plane([9,0,4],[8,0,0],[8,1,0],[9,1,4]),e.Plane([9,0,0],[10,0,4],[10,1,4],[9,1,0])])]),n=e.Bounding([n,l,i]),t=(n.textureNums=[-1,0,-1],e.primaryLightSources=[[40,50,40]],e.primaryLightSources[0].intensity=5e4,e.primaryLightSources[0].variation=20,e.ambientLight=[.2,.2,.2],e.queue.push(a,n),engine.renderer.render(),document.createElement("div"));document.body.appendChild(t),setInterval(()=>{t.textContent=engine.renderer.fps},100)}buildScene();
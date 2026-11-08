/* PARSEURS (KML / GPX / GeoJSON) */
var Parse = (function(){
  function kids(el, tag){ var r=[]; if(!el) return r; for(var n=el.firstChild;n;n=n.nextSibling){ if(n.nodeType===1 && (n.localName||n.nodeName.split(':').pop())===tag) r.push(n);} return r; }
  function kid(el, tag){ return kids(el, tag)[0] || null; }
  function txt(el, tag){ var k = tag ? kid(el, tag) : el; return k ? (k.textContent||'').trim() : ''; }
  function all(el, tag){ return Array.prototype.slice.call(el.getElementsByTagNameNS('*', tag)); }

  function kmlColor(c){ // aabbggrr -> {color, opacity}
    c = (c||'').trim().replace('#','');
    if(!/^[0-9a-f]{8}$/i.test(c)) return null;
    return { color: '#'+c.substr(6,2)+c.substr(4,2)+c.substr(2,2), opacity: parseInt(c.substr(0,2),16)/255 };
  }
  function readStyle(s){
    var o = {};
    var ls = kid(s,'LineStyle'), ps = kid(s,'PolyStyle'), is = kid(s,'IconStyle');
    if(ls){ var lc=kmlColor(txt(ls,'color')); if(lc){o.line=lc.color;o.lineOp=lc.opacity;} var w=parseFloat(txt(ls,'width')); if(w) o.width=w; }
    if(ps){ var pc=kmlColor(txt(ps,'color')); if(pc){o.fill=pc.color;o.fillOp=pc.opacity;} if(txt(ps,'fill')==='0') o.noFill=true; if(txt(ps,'outline')==='0') o.noOutline=true; }
    if(is){ var ic=kid(is,'Icon'); if(ic) o.icon=txt(ic,'href'); var icc=kmlColor(txt(is,'color')); if(icc) o.iconColor=icc.color; }
    return o;
  }
  function coords(str){
    var out=[]; (str||'').trim().split(/\s+/).forEach(function(t){ var p=t.split(','); var lon=parseFloat(p[0]), lat=parseFloat(p[1]); if(isFinite(lat)&&isFinite(lon)) out.push([lat,lon]); });
    return out;
  }
  function folderPath(pm){
    var parts=[]; for(var p=pm.parentNode;p&&p.nodeType===1;p=p.parentNode){ var ln=p.localName; if(ln==='Folder'){ var n=txt(p,'name'); if(n) parts.unshift(n);} }
    return parts;
  }
  function htmlToText(h){
    if(!h) return '';
    if(typeof DOMParser!=='undefined' && typeof document!=='undefined'){
      var d=new DOMParser().parseFromString('<div>'+h.replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|div|tr|li)>/gi,'\n')+'</div>','text/html');
      return (d.body.textContent||'').replace(/\n{3,}/g,'\n\n').trim();
    }
    return h.replace(/<[^>]+>/g,' ').trim();
  }

  function kml(text){
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    if(doc.getElementsByTagName('parsererror').length) throw new Error('KML illisible');
    var styles = {};
    all(doc,'Style').forEach(function(s){ var id=s.getAttribute('id'); if(id) styles['#'+id]=readStyle(s); });
    all(doc,'StyleMap').forEach(function(sm){ var id=sm.getAttribute('id'); if(!id) return; var normal=null;
      kids(sm,'Pair').forEach(function(p){ if(txt(p,'key')==='normal') normal = txt(p,'styleUrl') || (kid(p,'Style')? {inline:readStyle(kid(p,'Style'))}:null); });
      styles['#'+id] = {ref: normal}; });
    function resolve(url){
      var s = styles['#'+String(url||'').split('#').pop()], g=0;
      while(s && s.ref && g++<6){ s = s.ref.inline ? s.ref.inline : styles['#'+String(s.ref).split('#').pop()]; }
      return s || {};
    }
    var res = {points:[], lines:[], polys:[]};
    all(doc,'Placemark').forEach(function(pm){
      var st = {}; var su = txt(pm,'styleUrl'); if(su) st = resolve(su);
      var inl = kid(pm,'Style'); if(inl){ var o=readStyle(inl); for(var k in o) st[k]=o[k]; }
      var name = txt(pm,'name'), folder = folderPath(pm), desc = htmlToText(txt(pm,'description'));
      var data = [];
      var ed = kid(pm,'ExtendedData');
      if(ed){
        all(ed,'Data').forEach(function(d){ var v=txt(d,'value'); if(v) data.push([d.getAttribute('name')||'', v]); });
        all(ed,'SimpleData').forEach(function(d){ var v=(d.textContent||'').trim(); if(v) data.push([d.getAttribute('name')||'', v]); });
      }
      all(pm,'Point').forEach(function(p){ var c=coords(txt(p,'coordinates'))[0]; if(c) res.points.push({name:name, lat:c[0], lon:c[1], folder:folder, desc:desc, data:data, style:st}); });
      all(pm,'LineString').forEach(function(l){ var c=coords(txt(l,'coordinates')); if(c.length>1) res.lines.push({name:name, coords:c, style:st, folder:folder, desc:desc, data:data}); });
      all(pm,'Polygon').forEach(function(pg){
        var rings=[]; var ob=kid(pg,'outerBoundaryIs'); if(ob){ var r=coords(txt(kid(ob,'LinearRing'),'coordinates')); if(r.length>2) rings.push(r); }
        kids(pg,'innerBoundaryIs').forEach(function(ib){ var r=coords(txt(kid(ib,'LinearRing'),'coordinates')); if(r.length>2) rings.push(r); });
        if(rings.length) res.polys.push({name:name, rings:rings, style:st, folder:folder, desc:desc, data:data});
      });
    });
    return res;
  }

  function gpx(text){
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    var res = {points:[], lines:[], polys:[]};
    function pt(e){ var la=parseFloat(e.getAttribute('lat')), lo=parseFloat(e.getAttribute('lon')); return isFinite(la)&&isFinite(lo)?[la,lo]:null; }
    all(doc,'wpt').forEach(function(w){ var c=pt(w); if(c) res.points.push({name:txt(w,'name'), lat:c[0], lon:c[1], folder:[], desc:txt(w,'desc')||txt(w,'cmt'), data:[], style:{}}); });
    all(doc,'trkseg').forEach(function(s){ var c=all(s,'trkpt').map(pt).filter(Boolean); if(c.length>1) res.lines.push({name:'', coords:c, style:{}}); });
    all(doc,'rte').forEach(function(r){ var c=all(r,'rtept').map(pt).filter(Boolean); if(c.length>1) res.lines.push({name:txt(r,'name'), coords:c, style:{}}); });
    return res;
  }

  function geojson(text){
    var g = JSON.parse(text), res = {points:[], lines:[], polys:[]};
    var feats = g.type==='FeatureCollection' ? g.features : (g.type==='Feature' ? [g] : [{type:'Feature',geometry:g,properties:{}}]);
    function ll(c){ return [c[1], c[0]]; }
    feats.forEach(function(f){
      var p=f.properties||{}, name=String(p.name||p.nom||p.Name||p.NOM||p.numero||p.num||''), geo=f.geometry; if(!geo) return;
      var data=[]; for(var k in p){ if(p[k]!=null && typeof p[k]!=='object' && k!=='name') data.push([k,String(p[k])]); }
      (function walk(geo){
        var t=geo.type, c=geo.coordinates;
        if(t==='Point') res.points.push({name:name, lat:c[1], lon:c[0], folder:[], desc:String(p.description||''), data:data, style:{}});
        else if(t==='MultiPoint') c.forEach(function(x){ res.points.push({name:name, lat:x[1], lon:x[0], folder:[], desc:'', data:data, style:{}}); });
        else if(t==='LineString') res.lines.push({name:name, coords:c.map(ll), style:{}});
        else if(t==='MultiLineString') c.forEach(function(x){ res.lines.push({name:name, coords:x.map(ll), style:{}}); });
        else if(t==='Polygon') res.polys.push({name:name, rings:c.map(function(r){return r.map(ll);}), style:{}});
        else if(t==='MultiPolygon') c.forEach(function(pg){ res.polys.push({name:name, rings:pg.map(function(r){return r.map(ll);}), style:{}}); });
        else if(t==='GeometryCollection') geo.geometries.forEach(walk);
      })(geo);
    });
    return res;
  }

  /* Détection des pylônes : "P12", "Pylône 72N", "N°12", "12", "12bis"…
     ou tout point rangé dans un dossier dont le nom contient "pyl". */
  var PYL_RE = /^\s*(?:pyl[oô]nes?|pyl\.?|p|n°|no\.?|#)?\s*[-.]?\s*(\d{1,4}(?:\s?(?:bis|ter|[a-z]{1,2}))?)\b/i;
  function pylonLabel(pt){
    var m = (pt.name||'').match(PYL_RE);
    if(m) return m[1].replace(/\s+/g,'').toUpperCase();
    if(pt.folder.some(function(f){ return /pyl/i.test(f); }) && pt.name) return pt.name.trim();
    return null;
  }
  function tagPylons(res){
    var n=0; res.points.forEach(function(p){ p.pylon = pylonLabel(p); if(p.pylon) n++; });
    res.pylonCount = n; return res;
  }

  return { kml:kml, gpx:gpx, geojson:geojson, tagPylons:tagPylons, pylonLabel:pylonLabel };
})();
if (typeof window !== 'undefined') { window.Carto = window.Carto || {}; window.Carto.Parse = Parse; }
if (typeof module !== 'undefined') module.exports = Parse;

import i18n from "../../../i18n";

/**
 * Copy for the Match page's Tactics Lab, restored from the first Lab (4bd326e) under tlab.*,
 * with the terrain's own lines under tlab.topo.*.
 */
const bundles = {
 "en": {
  "tlab": {
   "modeLabel": "How to watch",
   "coachMode": "Coach",
   "exploreMode": "Explore",
   "viewLabel": "Camera",
   "broadcast": "Broadcast",
   "tactical": "From above",
   "noGl": "This browser can't draw the 3D pitch. Try Chrome, Edge or Safari.",
   "keyFault": "The mistake behind a goal",
   "coach": {
    "goal": "Goal for {{team}}! {{name}} finishes a {{xg}}% chance.",
    "shot": "{{name}} shoots. A {{xg}}% chance.",
    "fault": "This is the mistake: {{name}} {{bug}}. Watch what it opens up.",
    "better": "{{name}} had a better pass on: #{{n}} {{other}}, safer and more dangerous.",
    "behind": "#{{n}} {{name}} runs in behind {{team}}'s last line.",
    "pocket": "#{{n}} {{name}} is free between {{team}}'s lines, {{m}} m from the nearest man.",
    "squeeze": "{{k}} {{team}} players squeeze {{name}}. Their shadows cut off the short passes.",
    "counter": "{{team}} win it back and break forward before the defence can set.",
    "noOptions": "{{name}} has nowhere to go: {{team}} have closed every passing lane.",
    "build": "{{team}} build from the back. {{opp}} wait in a {{block}}.",
    "space": "{{team}} control {{p}}% of the pitch. The high ground is theirs."
   },
   "eyebrow": "Tactics Lab",
   "title": "See the game",
   "lede": "A coach watches the match with you and points at one thing at a time: the space, the pass that was on, the run nobody tracked. Switch to Explore to turn the lenses on yourself, click a player to follow them, or click the grass to see who gets there first.",
   "loading": "Loading every second of the match…",
   "failed": "This match's tracking didn't load. Reload the page to try again.",
   "pitchLabel": "Live pitch with all 22 players and the ball",
   "lensesLabel": "Lenses",
   "nowLabel": "This moment in numbers",
   "attacks": "{{home}} attack to the right all match",
   "play": "Play",
   "pause": "Pause",
   "speed": "Speed",
   "prev": "Previous",
   "next": "Next",
   "jumpTo": "Jump between",
   "dna": "Match DNA",
   "dnaLabel": "Match timeline. Drag to move through the 90 minutes.",
   "half": "Half-time",
   "show": "Show",
   "shown": "On",
   "clickFocus": "Click to follow this player",
   "phase": {
    "build": "Build-up",
    "progress": "Progression",
    "final": "Final third",
    "counter": "Counter"
   },
   "block": {
    "high": "High press",
    "mid": "Mid block",
    "low": "Low block"
   },
   "moment": {
    "goal": "Goals",
    "shot": "Shots",
    "fault": "Mistakes",
    "turnover": "Turnovers"
   },
   "unit": {
    "gk": "Goalkeeper",
    "def": "Defender",
    "mid": "Midfielder",
    "att": "Forward"
   },
   "lens": {
    "space": "Space",
    "options": "Options",
    "shape": "Shape",
    "pressure": "Pressure",
    "runs": "Runs",
    "chain": "The move"
   },
   "how": {
    "space": "The grass takes the colour of the side that would reach a ball there first. The dark seam is where it's a coin toss.",
    "options": "Every pass the player on the ball could make. Thicker lines are safer. A cross marks the defender who cuts a lane, and yellow is a better pass than the one played.",
    "shape": "Each team's back, middle and front lines as strings, and its block as an outline. The light band is the gap between the defending side's lines.",
    "pressure": "Who is closing the ball down and how close they are. The dark cones behind them are passes they block just by standing there.",
    "runs": "The last six seconds of every player's movement. Arrows are sprints, and the dashed line is the last defender.",
    "chain": "The current move from the moment the ball was won: every pass numbered and every carry dashed."
   },
   "g": {
    "space": "Space owned",
    "spaceSub": "{{h}} own {{home}}% of {{a}}'s half. {{a}} own {{away}}% of {{h}}'s.",
    "options": "Passing options",
    "optionsOf": "of {{n}} lanes open",
    "best": "Best option:",
    "played": "played to",
    "pressure": "Pressure on the ball",
    "pressureSub": "{{n}} closing down",
    "behind": "{{n}} of 10 {{team}} players are behind the ball.",
    "shape": "Shape",
    "line": "Back line",
    "depth": "Length",
    "width": "Width",
    "probe": "Race for the ball",
    "probeHint": "Click any patch of grass to see who gets there first.",
    "probeWin": "{{name}} ({{team}}) gets there first, in {{s}} s.",
    "probeOwn": "{{team}} win a ball played there {{p}}% of the time.",
    "focus": "Following {{name}}. The grass now shows only the ground they own. Click them again to stop."
   },
   "topo": {
    "title": "See the whole match.",
    "sub": "Every second of the 90 minutes on a live pitch. Let the coach point out what matters, or pick one feature yourself: who owns the space, the passes that were on, each team's lines, the press, the runs and the move.",
    "legendHome": "High {{c}} ground: {{team}} would reach a ball there first.",
    "legendAway": "High {{c}} ground: {{team}} own it.",
    "legendSeam": "Valleys are no man's land, where the two sides meet.",
    "legendLines": "Lines drawn on the land are what the coach is showing.",
    "blue": "blue",
    "amber": "amber",
    "own": "{{team}} own {{p}}% of the land right now.",
    "goals": "Goals",
    "coachOn": "Coach",
    "explore": "Explore",
    "drag": "Drag to turn the land",
    "what": "What you're seeing",
    "spaceLine": "{{team}} control {{p}}% of the pitch. The high ground is theirs.",
    "spaceHow": "The land rises under the side that would reach a ball there first: blue for {{h}}, amber for {{a}}. Valleys are where it's a coin toss."
   }
  }
 },
 "es": {
  "tlab": {
   "modeLabel": "Cómo verlo",
   "coachMode": "Entrenador",
   "exploreMode": "Explorar",
   "viewLabel": "Cámara",
   "broadcast": "Televisión",
   "tactical": "Desde arriba",
   "noGl": "Este navegador no puede dibujar el campo en 3D. Prueba Chrome, Edge o Safari.",
   "keyFault": "El error detrás de un gol",
   "coach": {
    "goal": "¡Gol de {{team}}! {{name}} remata una ocasión del {{xg}}%.",
    "shot": "Tira {{name}}. Una ocasión del {{xg}}%.",
    "fault": "Este es el error: {{name}}, {{bug}}. Mira lo que abre.",
    "better": "{{name}} tenía un pase mejor: #{{n}} {{other}}, más seguro y más peligroso.",
    "behind": "#{{n}} {{name}} se mete a la espalda de la última línea de {{team}}.",
    "pocket": "#{{n}} {{name}} está libre entre las líneas de {{team}}, a {{m}} m del rival más cercano.",
    "squeeze": "{{k}} jugadores de {{team}} encierran a {{name}}. Sus sombras cortan los pases cortos.",
    "counter": "{{team}} recupera y sale rápido antes de que la defensa se ordene.",
    "noOptions": "{{name}} no tiene salida: {{team}} ha cerrado todas las líneas de pase.",
    "build": "{{team}} sale desde atrás. {{opp}} espera en {{block}}.",
    "space": "{{team}} controla el {{p}}% del campo. El terreno alto es suyo."
   },
   "eyebrow": "Laboratorio táctico",
   "title": "Mira el partido",
   "lede": "Un entrenador mira el partido contigo y señala una cosa cada vez: el espacio, el pase que estaba, el desmarque que nadie siguió. Cambia a Explorar para activar las lentes tú mismo, pulsa un jugador para seguirlo o pulsa el césped para ver quién llega primero.",
   "loading": "Cargando cada segundo del partido…",
   "failed": "No se cargó el seguimiento de este partido. Recarga la página para intentarlo de nuevo.",
   "pitchLabel": "Campo en vivo con los 22 jugadores y el balón",
   "lensesLabel": "Lentes",
   "nowLabel": "Este momento en cifras",
   "attacks": "{{home}} ataca hacia la derecha todo el partido",
   "play": "Reproducir",
   "pause": "Pausa",
   "speed": "Velocidad",
   "prev": "Anterior",
   "next": "Siguiente",
   "jumpTo": "Saltar entre",
   "dna": "ADN del partido",
   "dnaLabel": "Línea de tiempo del partido. Arrastra para moverte por los 90 minutos.",
   "half": "Descanso",
   "show": "Ver",
   "shown": "Activa",
   "clickFocus": "Pulsa para seguir a este jugador",
   "phase": {
    "build": "Salida",
    "progress": "Progresión",
    "final": "Último tercio",
    "counter": "Contra"
   },
   "block": {
    "high": "Presión alta",
    "mid": "Bloque medio",
    "low": "Bloque bajo"
   },
   "moment": {
    "goal": "Goles",
    "shot": "Tiros",
    "fault": "Errores",
    "turnover": "Pérdidas"
   },
   "unit": {
    "gk": "Portero",
    "def": "Defensa",
    "mid": "Centrocampista",
    "att": "Delantero"
   },
   "lens": {
    "space": "Espacio",
    "options": "Opciones",
    "shape": "Forma",
    "pressure": "Presión",
    "runs": "Carreras",
    "chain": "La jugada"
   },
   "how": {
    "space": "El césped toma el color del equipo que llegaría primero a un balón ahí. La costura oscura es donde está igualado.",
    "options": "Cada pase que puede dar el jugador con balón. Las líneas gruesas son más seguras. Una cruz marca al defensor que corta la línea, y el amarillo es un pase mejor que el que se dio.",
    "shape": "Las líneas de defensa, medio y ataque de cada equipo, y su bloque como contorno. La franja clara es el hueco entre las líneas del equipo que defiende.",
    "pressure": "Quién presiona el balón y a qué distancia. Los conos oscuros detrás son pases que bloquean solo con su posición.",
    "runs": "Los últimos seis segundos de movimiento de cada jugador. Las flechas son esprints y la línea discontinua es el último defensor.",
    "chain": "La jugada actual desde la recuperación: cada pase numerado y cada conducción discontinua."
   },
   "g": {
    "space": "Espacio controlado",
    "spaceSub": "{{h}} controla el {{home}}% del campo de {{a}}. {{a}} controla el {{away}}% del de {{h}}.",
    "options": "Opciones de pase",
    "optionsOf": "de {{n}} líneas abiertas",
    "best": "Mejor opción:",
    "played": "jugó a",
    "pressure": "Presión sobre el balón",
    "pressureSub": "{{n}} presionando",
    "behind": "{{n}} de 10 jugadores de {{team}} están por detrás del balón.",
    "shape": "Forma",
    "line": "Línea defensiva",
    "depth": "Largo",
    "width": "Ancho",
    "probe": "Carrera por el balón",
    "probeHint": "Pulsa cualquier zona del césped para ver quién llega primero.",
    "probeWin": "{{name}} ({{team}}) llega primero, en {{s}} s.",
    "probeOwn": "{{team}} gana un balón jugado ahí el {{p}}% de las veces.",
    "focus": "Siguiendo a {{name}}. El césped muestra solo su zona. Púlsalo otra vez para dejar de seguirlo."
   },
   "topo": {
    "title": "Mira el partido entero.",
    "sub": "Cada segundo de los 90 minutos en un campo en vivo. Deja que el entrenador señale lo importante o elige una función: de quién es el espacio, los pases posibles, las líneas, la presión, los desmarques y la jugada.",
    "legendHome": "Terreno alto {{c}}: {{team}} llegaría antes al balón ahí.",
    "legendAway": "Terreno alto {{c}}: lo domina {{team}}.",
    "legendSeam": "Los valles son tierra de nadie, donde se encuentran los dos equipos.",
    "legendLines": "Las líneas sobre el terreno son lo que señala el entrenador.",
    "blue": "azul",
    "amber": "ámbar",
    "own": "{{team}} domina el {{p}}% del terreno ahora mismo.",
    "goals": "Goles",
    "coachOn": "Entrenador",
    "explore": "Explorar",
    "drag": "Arrastra para girar el terreno",
    "what": "Lo que estás viendo",
    "spaceLine": "{{team}} controla el {{p}}% del campo. El terreno alto es suyo.",
    "spaceHow": "El terreno se eleva bajo el equipo que llegaría antes al balón: azul para {{h}}, ámbar para {{a}}. Los valles son terreno disputado."
   }
  }
 },
 "hi": {
  "tlab": {
   "modeLabel": "कैसे देखें",
   "coachMode": "कोच",
   "exploreMode": "एक्सप्लोर",
   "viewLabel": "कैमरा",
   "broadcast": "ब्रॉडकास्ट",
   "tactical": "ऊपर से",
   "noGl": "यह ब्राउज़र 3D पिच नहीं बना सकता। Chrome, Edge या Safari आज़माएँ।",
   "keyFault": "गोल के पीछे की गलती",
   "coach": {
    "goal": "{{team}} का गोल! {{name}} ने {{xg}}% मौके को गोल में बदला।",
    "shot": "{{name}} का शॉट। {{xg}}% का मौका।",
    "fault": "यह है गलती: {{name}} — {{bug}}। देखिए इससे क्या खुलता है।",
    "better": "{{name}} के पास बेहतर पास था: #{{n}} {{other}}, ज़्यादा सुरक्षित और ज़्यादा ख़तरनाक।",
    "behind": "#{{n}} {{name}} {{team}} की आख़िरी लाइन के पीछे दौड़ रहे हैं।",
    "pocket": "#{{n}} {{name}} {{team}} की लाइनों के बीच खाली हैं, सबसे पास वाले से {{m}} मीटर दूर।",
    "squeeze": "{{team}} के {{k}} खिलाड़ी {{name}} को घेर रहे हैं। उनकी परछाइयाँ छोटे पास रोक देती हैं।",
    "counter": "{{team}} गेंद वापस जीतकर तेज़ी से आगे बढ़ती है, इससे पहले कि बचाव जम सके।",
    "noOptions": "{{name}} के पास कोई रास्ता नहीं: {{team}} ने हर पास का रास्ता बंद कर दिया है।",
    "build": "{{team}} पीछे से खेल बनाती है। {{opp}} {{block}} में इंतज़ार करती है।",
    "space": "{{team}} के पास {{p}}% मैदान है। ऊँची ज़मीन उनकी है।"
   },
   "eyebrow": "टैक्टिक्स लैब",
   "title": "खेल को देखिए",
   "lede": "एक कोच आपके साथ मैच देखता है और एक बार में एक चीज़ दिखाता है: जगह, जो पास मौजूद था, वह दौड़ जिसे किसी ने नहीं पकड़ा। लेंस ख़ुद चालू करने के लिए Explore चुनें, किसी खिलाड़ी को फ़ॉलो करने के लिए उस पर क्लिक करें, या घास पर क्लिक करके देखें कि वहाँ पहले कौन पहुँचता है।",
   "loading": "मैच का हर सेकंड लोड हो रहा है…",
   "failed": "इस मैच की ट्रैकिंग लोड नहीं हुई। दोबारा कोशिश के लिए पेज रीलोड करें।",
   "pitchLabel": "सभी 22 खिलाड़ियों और गेंद के साथ लाइव पिच",
   "lensesLabel": "लेंस",
   "nowLabel": "यह पल आँकड़ों में",
   "attacks": "{{home}} पूरे मैच दाईं ओर आक्रमण करती है",
   "play": "चलाएँ",
   "pause": "रोकें",
   "speed": "गति",
   "prev": "पिछला",
   "next": "अगला",
   "jumpTo": "इनके बीच जाएँ",
   "dna": "मैच DNA",
   "dnaLabel": "मैच की टाइमलाइन। 90 मिनट में घूमने के लिए खींचें।",
   "half": "हाफ़-टाइम",
   "show": "दिखाएँ",
   "shown": "चालू",
   "clickFocus": "इस खिलाड़ी को फ़ॉलो करने के लिए क्लिक करें",
   "phase": {
    "build": "बिल्ड-अप",
    "progress": "आगे बढ़ना",
    "final": "अंतिम तिहाई",
    "counter": "काउंटर"
   },
   "block": {
    "high": "ऊँचा प्रेस",
    "mid": "मिड ब्लॉक",
    "low": "लो ब्लॉक"
   },
   "moment": {
    "goal": "गोल",
    "shot": "शॉट",
    "fault": "गलतियाँ",
    "turnover": "गेंद गँवाना"
   },
   "unit": {
    "gk": "गोलकीपर",
    "def": "डिफ़ेंडर",
    "mid": "मिडफ़ील्डर",
    "att": "फ़ॉरवर्ड"
   },
   "lens": {
    "space": "जगह",
    "options": "विकल्प",
    "shape": "आकार",
    "pressure": "दबाव",
    "runs": "दौड़",
    "chain": "मूव"
   },
   "how": {
    "space": "घास उस टीम का रंग ले लेती है जो वहाँ खेली गई गेंद तक पहले पहुँचेगी। गहरी रेखा वहाँ है जहाँ मुकाबला बराबर है।",
    "options": "गेंद वाले खिलाड़ी के हर संभव पास। मोटी रेखाएँ ज़्यादा सुरक्षित हैं। क्रॉस उस डिफ़ेंडर को दिखाता है जो रास्ता काटता है, और पीला खेले गए पास से बेहतर पास है।",
    "shape": "हर टीम की पीछे, बीच और आगे की लाइनें धागों की तरह, और उसका ब्लॉक एक घेरे की तरह। हल्की पट्टी बचाव करने वाली टीम की लाइनों के बीच की खाली जगह है।",
    "pressure": "कौन गेंद पर दबाव डाल रहा है और कितने पास है। उनके पीछे के गहरे कोन वे पास हैं जिन्हें वे सिर्फ़ खड़े रहकर रोकते हैं।",
    "runs": "हर खिलाड़ी की पिछले छह सेकंड की चाल। तीर स्प्रिंट हैं, और टूटी रेखा आख़िरी डिफ़ेंडर है।",
    "chain": "गेंद जीतने के पल से अब तक की मूव: हर पास पर नंबर और हर कैरी टूटी रेखा में।"
   },
   "g": {
    "space": "नियंत्रित जगह",
    "spaceSub": "{{h}} के पास {{a}} के हाफ़ का {{home}}% है। {{a}} के पास {{h}} के हाफ़ का {{away}}%।",
    "options": "पास के विकल्प",
    "optionsOf": "{{n}} में से रास्ते खुले",
    "best": "सबसे अच्छा विकल्प:",
    "played": "पास गया",
    "pressure": "गेंद पर दबाव",
    "pressureSub": "{{n}} दबाव डाल रहे",
    "behind": "{{team}} के 10 में से {{n}} खिलाड़ी गेंद के पीछे हैं।",
    "shape": "आकार",
    "line": "पीछे की लाइन",
    "depth": "लंबाई",
    "width": "चौड़ाई",
    "probe": "गेंद की दौड़",
    "probeHint": "घास के किसी भी हिस्से पर क्लिक करें और देखें कि वहाँ पहले कौन पहुँचता है।",
    "probeWin": "{{name}} ({{team}}) {{s}} सेकंड में पहले पहुँचते हैं।",
    "probeOwn": "{{team}} वहाँ खेली गई गेंद {{p}}% बार जीतती है।",
    "focus": "{{name}} को फ़ॉलो कर रहे हैं। घास अब सिर्फ़ उनकी जगह दिखाती है। रोकने के लिए उन पर फिर क्लिक करें।"
   },
   "topo": {
    "title": "पूरा मैच देखें।",
    "sub": "90 मिनट का हर सेकंड एक लाइव पिच पर। कोच को ज़रूरी बातें दिखाने दें, या ख़ुद एक फ़ीचर चुनें: जगह किसकी है, कौन से पास खुले थे, टीमों की लाइनें, प्रेस, दौड़ और मूव।",
    "legendHome": "ऊँची {{c}} ज़मीन: वहाँ गेंद तक {{team}} पहले पहुँचते।",
    "legendAway": "ऊँची {{c}} ज़मीन: उस पर {{team}} का क़ब्ज़ा।",
    "legendSeam": "घाटियाँ किसी की नहीं, जहाँ दोनों टीमें मिलती हैं।",
    "legendLines": "ज़मीन पर बनी रेखाएँ वह हैं जो कोच दिखा रहा है।",
    "blue": "नीली",
    "amber": "नारंगी",
    "own": "अभी {{p}}% ज़मीन {{team}} की है।",
    "goals": "गोल",
    "coachOn": "कोच",
    "explore": "खोजें",
    "drag": "ज़मीन घुमाने के लिए खींचें",
    "what": "आप क्या देख रहे हैं",
    "spaceLine": "{{team}} के पास {{p}}% मैदान है। ऊँची ज़मीन उनकी है।",
    "spaceHow": "ज़मीन उस टीम के नीचे उठती है जो वहाँ गेंद तक पहले पहुँचती: नीली {{h}} के लिए, नारंगी {{a}} के लिए। घाटियों में बराबरी है।"
   }
  }
 }
};
for (const [lng, b] of Object.entries(bundles)) i18n.addResourceBundle(lng, "translation", b, true, false);

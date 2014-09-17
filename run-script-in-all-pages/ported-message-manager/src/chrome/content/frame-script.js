addEventListener("DOMContentLoaded", function(event) {
  var doc = event.originalTarget;
  if (doc.nodeName != "#document" || !doc.body) return; // only documents with body
  doc.body.style.border = "5px solid red";
});


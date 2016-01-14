$(function(){
  var numSales = 0;

  $.post('/webhook').then(function(res){
    console.log('Created Webhook');
  }, function(err){
    console.log(err);
  });

  var register = new Audio("/sounds/cha-ching.mp3");

  $.get('/vendor').then(function(res){
    console.log(res);
    ws.send(JSON.stringify(res));
  }, function(err){
    console.log(err);
  });

  var host = location.origin.replace(/^http/, 'ws')
  var ws = new WebSocket(host);

  ws.onmessage = function (event) {
    console.log('got a message yo');
    setSales(++numSales);
    playSound();
  };

  setSales(numSales);

  function playSound(){
    register.play();
  }

  function setSales(numSales){
    $('#sales_count').text(numSales);
  }
});



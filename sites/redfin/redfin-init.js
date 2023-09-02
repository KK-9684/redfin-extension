(function() {
    
})();

(function() {
    var s = document.createElement('script');
    s.src = chrome.runtime.getURL('libs/jquery-3.6.0.min.js');
    s.onload = function() {
        var s = document.createElement('script');
        s.type = 'module';
        s.src = chrome.runtime.getURL('sites/redfin/redfin.js');
        s.onload = function() {
            
        };
        (document.head || document.documentElement).appendChild(s);
    };
    (document.head || document.documentElement).appendChild(s);
})();


// (function() {
//     var s = document.createElement('script');
//     s.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
//     s.onload = function() {
//         this.remove();
//     };
//     (document.head || document.documentElement).appendChild(s);
// })();

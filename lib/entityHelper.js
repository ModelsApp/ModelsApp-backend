var db = require('../config/connection');


exports.getNewId = (type) => {
    return new Promise((resolve, reject) => {
        var Counter;
        db.getInstance(function(p_db) {
            Counter = p_db.collection('counters');
            Counter.findOneAndUpdate(
                { _id: type },
                { $inc: { seq: 1 } },
                {new: true},
                function(err, seq) {
                    if(err) reject(err)
                    else resolve(seq.value.seq);
                });
          });
    })
}

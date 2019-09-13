let campaignIntervalSchema = require('../../model/campaign/campaignIntervalSchema');
let viewModels = require('../../model/campaign/campaignViewModel');
let moment = require('moment');
let imageUplader = require('../../lib/imageUplader');
let multiparty = require('multiparty');
let middleware = require('../../config/authMiddleware');
let pushProvider = require('../../lib/pushProvider');
let crypto = require('crypto');

module.exports = (app, Campaign, CampaignInterval, UserCampaign, entityHelper) => {

    app.post('/api/admin/campaign/:id/interval', async (req, res) => {
        let interval = req.body;
        let id = parseInt(req.params.id);
        if(interval && id){
            let campaign = await Campaign.findOne({_id: id});
            if(campaign){
                let errors = campaignIntervalSchema.campaignIntervalSchema.validate(interval);
                if(errors.length == 0){
                    if(interval.intervals){
                        interval._id = await entityHelper.getNewId('campaignIntervalId');
                        interval.campaign = campaign._id;

                        await CampaignInterval.insertOne(interval);
                        res.status(200).json(interval);
                    }else{
                      res.status(400).json({message: 'intervals are not defined'});
                    }
                  }else{
                    res.status(400).json(errors.map(x=>x.message));
                  }
            }else{
                res.status(404).json({message : "campaign not found"});
            }
        }else{
            res.status(404).json({message : "invalid parameters"});
        }
    });

    app.get('/api/campaign/:id/interval', middleware.isAuthorized,  async (req, res) => {
      let id = parseInt(req.params.id);
      let user = await req.user;
      if(id){
          let campaign = await Campaign.findOne({_id: id});
          if(campaign && campaign.users.filter(x => x == user._id).length > 0){
            let intervals = await CampaignInterval.find({campaign : id }).toArray();
            intervals = intervals.map(x => {
              let interval = {
                address: x.location.address,
                city: x.location.city,
                coordinates: x.location.coordinates,
                _id: x._id
              }
              return interval;
            })
            res.status(200).json(intervals);
          }else{
              res.status(404).json({message : "campaign not found or you are not participient"});
          }
      }else{
          res.status(404).json({message : "invalid parameters"});
      }
  });
  app.get('/api/campaign/:id/interval/:intervalId/slots', middleware.isAuthorized,  async (req, res) => {
    let id = parseInt(req.params.id);
    let intervalId =  parseInt(req.params.intervalId);
    var reqDate = req.body.date || req.query.date;
    let day = moment(reqDate);
    let date =  moment(reqDate).format('DD-MM-YYYY');
    let user = await req.user;
    if(reqDate && day.isValid()){
      if(id && intervalId){
        let userCampaign = await UserCampaign.findOne({ campaign: id, user: user._id});
        if(userCampaign){
          let interval = await CampaignInterval.findOne({_id : intervalId });
          if(interval){
            var newArr = await Promise.all(interval.intervals.map(async function (interval) {
              if(interval.day == day.format('dddd')){
                  
                var taken = await UserCampaign.countDocuments({ 'campaign': id, 'slot.date': date, 'slot.startTime': interval.start, 'slot.day': interval.day });
                interval.free = interval.slots - taken;

                interval._id = crypto.createHash('sha1').update(`${interval.start}${interval.end}${interval.day}`).digest("hex");
                interval.timestamp = moment(`2019-01-01 ${interval.start.replace('.',':')}`).format("X");
                return interval;
              }
            }));
            res.status(200).json(newArr.filter(x=> x != null).sort((a,b) => a.timestamp > b.timestamp));
          }else{
            res.status(404).json({message : "no interval found"});
          }
        }else{
            res.status(404).json({message : "campaign not found or you are not participient"});
        }
    }else{
        res.status(404).json({message : "invalid parameters"});
    }
    }else{
      res.status(404).json({message : "invalid date"});
    }
  });
  app.post('/api/campaign/:id/interval/:intervalId/book', middleware.isAuthorized,  async (req, res) => {
    let id = parseInt(req.params.id);
    let intervalId =  parseInt(req.params.intervalId);
    let reqDate = req.body.date || req.query.date;
    let slotId = req.body.slotId;
    let day = moment(reqDate);
    let date =  moment(reqDate).format('YYYY-MM-DD');
    let user = await req.user;
    if(reqDate && day.isValid()){
      if(id && intervalId && slotId){
        let userCampaign = await UserCampaign.findOne({ campaign: id, user: user._id});
        if(userCampaign){
          if(userCampaign.slot && userCampaign.slot.date && moment(userCampaign.slot.date).isAfter(moment())){
            res.status(404).json({message : "You arleady have valid booking"});
          }else{
            let interval = await CampaignInterval.findOne({_id : intervalId });
            if(interval){
              let slot = interval.intervals.map(x=> {
                x._id = crypto.createHash('sha1').update(`${x.start}${x.end}${x.day}`).digest("hex");
                return x;
              }).find(x => x._id == slotId);
              if(slot){
                var taken = await UserCampaign.countDocuments({ 'campaign': id, 'slot.date': date, 'slot.startTime': slot.start, 'slot.day': slot.day });
                if(slot.slots - taken > 0){
                  await UserCampaign.findOneAndUpdate(
                    { 'campaign': id, user: user._id },
                    { $set: { 'slot.date': date, 'slot.startTime': slot.start, 'slot.day': slot.day,
                            'location' : interval.location
                  }});
                  res.status(200).json({message : "booked"});
                }else{
                  res.status(404).json({message : "no slot available"});
                }
              }else{
                res.status(404).json({message : "no slot found"});
              }
            }else{
              res.status(404).json({message : "no interval found"});
            }
          }
        }else{
            res.status(404).json({message : "campaign not found or you are not participient"});
        }
    }else{
        res.status(404).json({message : "invalid parameters"});
    }
    }else{
      res.status(404).json({message : "invalid date"});
    }
  });

}
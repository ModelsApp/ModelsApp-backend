module.exports = (app, Place, SamplePosts, entityHelper) => {
    //getListOfSamplePosts
    app.get('/api/samplePosts', async (req,res) => {
       await SamplePosts.find({ }).toArray( async (err, list) => {
            res.status(200).json(list);
        });
    });
    
    app.get('/api/samplePosts/place/:id', async (req, res) => {
        let id = parseInt(req.params.id);
        if(id){
            SamplePosts.find({ place : id}).toArray(async (err, list) => {
                res.status(200).json(list);
            });
        }else{
            res.status(400).json({message: "invalid parameters"});
        }
    });
    app.delete('/api/samplePosts/:id', async (req, res) => {
        let id = parseInt(req.params.id);
        if(id){
            await SamplePosts.deleteOne({_id : id});
            await SamplePosts.find({ }).toArray( async (err, list) => {
                res.status(200).json(list);
            });
        }else{
            res.status(400).json({message: "invalid parameters"});
        }
    });
    app.post('/api/samplePosts', async (req, res) => {
        let feedback = req.body.feedback;
        let place = parseInt(req.body.place);
        if(place && feedback){
            let dbPlace = await Place.findOne({ _id : place });
            if(dbPlace){
                let newSamplePost = {
                    _id: await entityHelper.getNewId('samplepostid'),
                    place:  place,
                    feedback : feedback
                };
                await SamplePosts.insertOne(newSamplePost);
                await SamplePosts.find({ }).toArray( async (err, list) => {
                    res.status(200).json(list);
                });
            }else{
                res.status(404).json({message: "place not found"});
            }
        }else{
            res.status(400).json({message: "invalid parameters"});
        }
    });
}
import puppeteer from 'puppeteer';
import path from 'path';
import { fetchViralPosts } from './fetchViralPosts';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import chromium from 'chromium'
import cron from 'node-cron'
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';

dotenv.config();
const pipelineAsync = promisify(pipeline);

// Define file paths for storing posts
const pendingPostsFilePath = path.join(__dirname, 'pendingPosts.json');
const postedPostsFilePath = path.join(__dirname, 'postedPosts.json');

// Function to load posts from a JSON file
function loadPosts(filePath: string): any[] {
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    }
    return [];
}

// Function to save posts to a JSON file
function savePosts(filePath: string, posts: any[]): void {
    fs.writeFileSync(filePath, JSON.stringify(posts, null, 2), 'utf8');
}
// Define an array of subreddits
const subreddits: string[] = [
    'Leetcode',
    'programming',
    'javascript',
    'csMajors',
    'ProgrammerHumor',
    'webdev',
    'learnprogramming',
    'cscareerquestions',
    'coding'
];
async function takeScreenshot(url: string) {


    const browser = await puppeteer.launch({
        headless: true,
        executablePath: chromium.path,
        args: [
            // '--no-sandbox', '--disable-setuid-sandbox',
            '--window-size=1920,1080',
            '--user-agent=Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0'
        ]
    });
    const page = await browser.newPage();

    // Set viewport size
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate to the URL
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000});
    await page.waitForSelector("body");
    //console.log("wait");
    
    // Introduce a delay to mimic human reading time
    await new Promise(resolve => setTimeout(resolve, 4340));
    //console.log("stopped waiting");
    // const filePath = path.join(__dirname, 'pageContent.txt');
    // fs.writeFileSync(filePath, pageContent, 'utf8');
    // //console.log(`Page content saved to: ${filePath}`);

    // Introduce a delay before interacting with the page
    await new Promise(resolve => setTimeout(resolve, 2530)); // Wait for 1 second



    // Wait for the post element to load with increased timeout
    try {
        await page.waitForSelector('shreddit-post', { visible: true, timeout: 60000 }); // Wait for up to 2 minutes
    } catch (error) {
        console.error('Error waiting for selector:', error);
        await browser.close();
        return; // Exit if the element is not found
    }
    //console.log("passed!");

    // Introduce a delay before taking a screenshot
    await new Promise(resolve => setTimeout(resolve, 3180));

    // Take a screenshot of the specific element (the post)
    const postElement = await page.$('shreddit-post'); // Adjusted selector
    if (postElement) {
        const boundingBox = await postElement.boundingBox();
        if (boundingBox) {
            const screenshotPath = path.join(__dirname, 'reddit_post_screenshot.png');
            await page.screenshot({
                path: screenshotPath,
                clip: {
                    x: boundingBox.x,
                    y: boundingBox.y,
                    width: boundingBox.width,
                    height: boundingBox.height
                }
            });
            //console.log(`Screenshot saved at: ${screenshotPath}`);
        } else {
            console.error('Could not determine bounding box of the element.');
        }
    } else {
        console.error('Post element not found.');
    }

    // Close the browser
    await browser.close();
}



const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  

// Initialize OAuth with hash function
const oauth = new OAuth({
    consumer: {
        key: process.env.CONSUMER_KEY!,
        secret: process.env.CONSUMER_SECRET!,
    },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string: string, key: string): string {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
    },
});

/**
 * Post a tweet with an image.
 * @param {string} text - The text of the tweet.
 * @param {string} mediaPath - The path to the image file.
 */
async function postTweetWithImage(text: string, mediaPath: string): Promise<void> {
    try {
        // Step 1: Upload Media to Twitter
        const mediaUploadResponse = await uploadMedia(mediaPath);
        const mediaIdString = mediaUploadResponse.data.media_id_string;

        // Step 2: Post Tweet with Media ID
        const tweetResponse = await postTweet(text, mediaIdString);

        //console.log('Tweet posted successfully!', tweetResponse.data);
    } catch (error: any) {
        console.error('Failed to post tweet:', error.response ? error.response.data : error.message);
    }
}

/**
 * Upload media to Twitter.
 * @param {string} mediaPath - The path to the image file.
 * @returns {Promise} - The response from the media upload request.
 */
async function uploadMedia(mediaPath: string) {
    const form = new FormData();
    form.append('media', fs.createReadStream(mediaPath));

    const requestData = {
        url: 'https://upload.twitter.com/1.1/media/upload.json',
        method: 'POST',
    };

    // Generate OAuth headers
    const oauthHeaders = oauth.toHeader(oauth.authorize(requestData, {
        key: process.env.ACCESS_TOKEN!,
        secret: process.env.ACCESS_TOKEN_SECRET!,
    }));

    // Combine headers
    const headers = {
        ...oauthHeaders,
        ...form.getHeaders(),
    };

    //console.log('Uploading media...');
    
    // Make the POST request
    try {
        const response = await axios.post(requestData.url, form, {
            headers: headers,
        });
        
        //console.log('Media upload response:', response.data);
        
        return response;
    } catch (error: any) {
        console.error('Error uploading media:', error.response ? error.response.data : error.message);
        throw error; // Rethrow to handle in calling function
    }
}

/**
 * Post a tweet with the given text and media ID.
 * @param {string} text - The text of the tweet.
 * @param {string} mediaIdString - The media ID returned from the upload.
 * @returns {Promise} - The response from the tweet posting request.
 */
async function postTweet(text: string, mediaIdString: string) {
    const requestData = {
        url: 'https://api.twitter.com/2/tweets',
        method: 'POST',
    };

    const body = {
        text: text,
        media: {
            media_ids: [mediaIdString],
        },
    };

    // Generate OAuth headers for posting a tweet
    const oauthHeaders = oauth.toHeader(oauth.authorize(requestData, {
        key: process.env.ACCESS_TOKEN!,
        secret: process.env.ACCESS_TOKEN_SECRET!,
    }));

    // Make the POST request
    const response = await axios.post(requestData.url, body, {
        headers: {
            ...oauthHeaders,
            'Content-Type': 'application/json',
        },
    });

    return response;
}
async function encodeImageStream(imagePath: string): Promise<string> {
    const chunks: Buffer[] = [];
    const readStream = createReadStream(imagePath);

    for await (const chunk of readStream) {
        chunks.push(chunk);
    }

    return Buffer.concat(chunks).toString('base64');
}

// Function to analyze an image using OpenAI API
async function analyzeImage(url: string): Promise<any> {
    const imagePath = 'dist/reddit_post_screenshot.png';
    await takeScreenshot(url);
    const base64Image = await encodeImageStream(imagePath);

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: `Assess the humor in this image from the perspective of someone in the field of computer science. Consider how it plays on common CS-related themes such as job struggles, unemployment in the tech industry, coding challenges, or general tech culture. Look for elements of satire, irony, or exaggerated scenarios that would resonate with people who have a background in programming or tech. How effectively does the image use these themes to create humor for a CS audience? Return your answer in the following JSON format. You must also consider is the post going to be viral. Does it use some common controversy?. Is the post enables viewers to comment on this, or engage in a discussion or share with others?
                    {
  "funninessRate": number (1 to 100) rate it very carefully. 1 is not funny at all, while 100 is very funny that it would blow people's minds,
  "whyFunny": explanation,
  "oneLiner": one line comment for the twitter post with this image. It must be funny, satirical. Be a hook. Or it might be a brief 1 liner summary about whats going on the image. Don't use any emojis. Make so that people will like it. It is very important for me. Be like human. Don't use common AI words. Be like it is genZ person posting it.
}` },
                  {
                    type: "image_url",
                    image_url: {
                        "url":  `data:image/jpeg;base64,${base64Image}`
                    },
                  },
                ],
              },
            ],
            response_format: { type: 'json_object' }
          });

          const content = response.choices[0].message.content;

          if (content) {
              try {
                  const jsonResponse = JSON.parse(content);
                  //console.log('Analysis Result:', jsonResponse);

                  // Add the result to the pendingPosts array
                  const ret = ({
                      oneliner: jsonResponse.oneLiner,
                      link: url,
                      funninessRate: jsonResponse.funninessRate
                  });
                  return ret;
              } catch (error: any) {
                  console.error('Failed to parse JSON:', error);
              }
          } else {
              console.error('Content is null, cannot parse JSON.');
          }
    } catch (error: any) {
        console.error('Error analyzing image:', error.response ? error.response.data : error.message);
    }
}

// Example usage
// const imagePath = 'src/reddit_post_screenshot.png'; // Path to your image
// analyzeImage('https://reddit.com/r/Sat/comments/1gdodc5/my_4_day_progression_on_the_sat_you_guys_can_do_it/');

// Example usage
// postTweetWithImage("Here is my image!", "src/reddit_post_screenshot.png");

async function main() {
    // Load posts from JSON files
    const pendingPosts = loadPosts(pendingPostsFilePath);
    const postedPosts = loadPosts(postedPostsFilePath);
    //console.log(pendingPosts);
    //console.log(postedPosts);
    
    for (const subreddit of subreddits) {
        try {
            const url = await fetchViralPosts(subreddit);

            // Check if the post is already in postedPosts or pendingPosts
            if (postedPosts.includes(url) || pendingPosts.some(post => post.link === url)) {
                //console.log(`Post already processed for URL: ${url}`);
                continue; // Skip to the next subreddit if the post is already processed
            }

            // Analyze the image and add to pendingPosts
            pendingPosts.push(await analyzeImage(url));
        } catch (error) {
            console.error(`Error processing subreddit ${subreddit}:`, error);
        }
    }

    // Sort pending posts by funninessRate in descending order
    pendingPosts.sort((a, b) => b.funninessRate - a.funninessRate);

    // Post only the top tweet
    if (pendingPosts.length > 0) {
        const topPost = pendingPosts[0];
        ////console.log(topPost.link, "this shit boutta be posted");
        try {
            
            await takeScreenshot(topPost.link);
            await postTweetWithImage(topPost.oneliner, 'dist/reddit_post_screenshot.png');
            // Add to postedPosts after successful posting
            postedPosts.push(topPost.link);
            // Remove the top post from pendingPosts
            pendingPosts.shift();
        } catch (error) {
            console.error('Error posting tweet:', error);
        }
    }

    // Save the updated posts back to JSON files
    savePosts(pendingPostsFilePath, pendingPosts);
    savePosts(postedPostsFilePath, postedPosts);
}


// Function to generate a random delay between 1 and 3 minutes
function getRandomDelay() {
    const min = 1; // Minimum delay in minutes
    const max = 3; // Maximum delay in minutes
    return Math.floor(Math.random() * (max - min + 1) + min) * 60 * 1000; // Convert minutes to milliseconds
}

// analyzeImage("https://www.reddit.com/r/ProgrammerHumor/comments/1gogmt7/interviewvsactualjob/");

// main();
// Schedule the main function to run every 60 minutes with a random delay
cron.schedule('0 * * * *', async () => {
    const delay = getRandomDelay();
    //console.log(`Delaying execution by ${delay / 60000} minutes`);
    await new Promise(resolve => setTimeout(resolve, delay));
    //console.log('Running the main function after delay');
    await main();
});
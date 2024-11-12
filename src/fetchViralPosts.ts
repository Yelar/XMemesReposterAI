import axios from 'axios';

export async function fetchViralPosts(subreddit: string): Promise<string> {
    const response = await axios.get(`https://www.reddit.com/r/${subreddit}/top.json?limit=5`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0' }
    });
    
    const url = `https://www.reddit.com${response.data.data.children[0].data.permalink}`
    // return response.data.data.children.map((post: any) => post.data.url);
    console.log(url);

    return url;
}
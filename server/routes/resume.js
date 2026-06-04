import express from "express";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const router = express.Router();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Gemini returns the tailored *content* as structured JSON; the client renders
// it into a fixed template that mirrors the reference resume layout. Factual
// header data (name, contact) is filled from the form, not rewritten.
const resumeSchema = {
  type: SchemaType.OBJECT,
  properties: {
    education: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          degree: { type: SchemaType.STRING },
          institution: { type: SchemaType.STRING },
          location: { type: SchemaType.STRING },
          years: { type: SchemaType.STRING },
          details: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ["degree", "institution"],
      },
    },
    skills: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    experience: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          role: { type: SchemaType.STRING },
          company: { type: SchemaType.STRING },
          location: { type: SchemaType.STRING },
          timeline: { type: SchemaType.STRING },
          bullets: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ["role", "company", "bullets"],
      },
    },
    projects: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          bullets: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ["name", "bullets"],
      },
    },
  },
  required: ["education", "skills", "experience", "projects"],
};

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: resumeSchema,
    // Low temperature keeps output faithful to the input and discourages the
    // model from "creatively" inventing details.
    temperature: 0.2,
  },
});

// Schema for extracting a candidate profile from their LinkedIn PDF export.
// Shaped to the FORM INPUT fields (note gpa + the metrics arrays), so the client
// can drop the result straight into the form.
const linkedinSchema = {
  type: SchemaType.OBJECT,
  properties: {
    basics: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING },
        title: { type: SchemaType.STRING },
        location: { type: SchemaType.STRING },
        phone: { type: SchemaType.STRING },
        email: { type: SchemaType.STRING },
        linkedin: { type: SchemaType.STRING },
        website: { type: SchemaType.STRING },
        github: { type: SchemaType.STRING },
      },
    },
    skills: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    education: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          degree: { type: SchemaType.STRING },
          gpa: { type: SchemaType.STRING },
          institution: { type: SchemaType.STRING },
          years: { type: SchemaType.STRING },
        },
        required: ["degree", "institution"],
      },
    },
    experience: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          company: { type: SchemaType.STRING },
          role: { type: SchemaType.STRING },
          location: { type: SchemaType.STRING },
          timeline: { type: SchemaType.STRING },
          description: { type: SchemaType.STRING },
          metrics: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ["company", "role"],
      },
    },
    projects: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          description: { type: SchemaType.STRING },
          metrics: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ["name"],
      },
    },
  },
  required: ["basics", "skills", "education", "experience", "projects"],
};

const linkedinModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: linkedinSchema,
    // Extraction, not generation — keep it strictly faithful to the PDF.
    temperature: 0.1,
  },
});

router.post("/match-roles", async (req, res) => {
  try {
    const { resume, jobPosting } = req.body;

    const prompt = `You are a professional resume writer. Tailor the candidate's
resume to the job posting and return JSON matching the provided schema.

Your single most important constraint is factual accuracy. Every statement you
write must be directly supported by the candidate's provided input. You may
rephrase for clarity and impact, but you must never invent facts.

Candidate information:
Education:
${JSON.stringify(resume.education, null, 2)}

Skills:
${resume.skills.join(", ")}

Work Experience:
${JSON.stringify(resume.experience, null, 2)}

Projects:
${JSON.stringify(resume.projects, null, 2)}

Job Posting:
Title: ${jobPosting.title}
Company: ${jobPosting.company}
Description: ${jobPosting.description}

Grounding rules (most important):
- Every bullet must be grounded strictly in the candidate's provided description
  and metrics for that specific role or project. You may rephrase, reorder, and
  use stronger action verbs, but you must NOT introduce any responsibility, task,
  technology, tool, team, scope, or achievement that is not explicitly present in
  the candidate's input for that entry.
- Do NOT invent, approximate, or embellish numbers. Use ONLY the metrics the
  candidate provided. Never add a percentage, count, dollar amount, time saved, or
  any other statistic that does not appear in the candidate's input.
- Incorporate keywords from the job posting ONLY when they accurately describe work
  the candidate actually did. Never add a keyword by inventing or implying
  experience the candidate did not state.
- For skills, return only skills the candidate listed (you may reorder by relevance
  to the job). Do not add skills they did not provide.
- If the source content for an entry is thin, write fewer bullets. Do not pad.

Formatting rules:
- Preserve factual fields exactly as given: degree, institution, location, years,
  company, role, timeline, and project names. Only rewrite descriptions/bullets.
- Write one bullet per distinct accomplishment found in the source content, up to a
  maximum of 4 bullets per entry. Fewer is fine when the source supports fewer.
- Bullet format: [Action verb] + [task grounded in the description] -> [outcome,
  using a candidate-provided metric when one genuinely applies].
- Do NOT start bullets with a bullet character or dash; return plain sentences.
- Keep each bullet to a single line: under ~140 characters (about 20 words).
- Keep the content to roughly one page, ordering experience and projects
  most-relevant-to-the-job first.
`

    const response = await model.generateContent(prompt);
    const parsed = JSON.parse(response.response.text());

    // Compose the final resume: factual header from the form + tailored content.
    const tailored = {
      name: resume.name,
      contact: {
        email: resume.email,
        phone: resume.phone,
        linkedin: resume.linkedin,
        website: resume.website,
        github: resume.github,
      },
      education: parsed.education || [],
      skills: parsed.skills || [],
      experience: parsed.experience || [],
      projects: parsed.projects || [],
    };

    res.json({ resume: tailored });
  } catch (err) {
    console.error("Resume generation failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Extract a candidate profile from an uploaded LinkedIn PDF export so the client
// can auto-fill the form. The PDF arrives as a base64 string in the JSON body.
router.post("/import-linkedin", async (req, res) => {
  try {
    const { pdf } = req.body;
    if (!pdf || typeof pdf !== "string") {
      return res.status(400).json({ error: "No PDF provided." });
    }

    const prompt = `You are extracting a candidate's profile from their own
LinkedIn profile PDF export. Return JSON matching the provided schema.

Extract ONLY information explicitly present in the PDF. Do not invent, infer,
approximate, or embellish anything. If a field is not present, return an empty
string (or empty array). Never fabricate numbers, dates, employers, schools, or
skills.

Field guidance:
- basics: full name, location, and any contact links shown (email, phone,
  personal website, github, linkedin URL). Leave a field blank if absent.
- basics.title: use the headline shown under the candidate's name. If there is
  no distinct headline, fall back to their current (or most recent) job title
  from the experience section. This is grounded in real data — not fabrication —
  so title should almost always be populated.
- skills: the candidate's listed skills, as individual strings.
- education: one entry per school. years = the date range shown. Include gpa
  only if it is printed.
- experience: one entry per position. company, role, location, timeline (the
  date range). description = a faithful prose summary built ONLY from the bullet
  points / role summary shown for that position. metrics = any statements from
  that position that contain a concrete number (percentage, count, dollar
  amount, time saved). Do NOT create metrics that are not literally in the PDF.
- projects: one entry per project shown, following the same description/metrics
  rules.`;

    const response = await linkedinModel.generateContent([
      { inlineData: { mimeType: "application/pdf", data: pdf } },
      prompt,
    ]);

    const profile = JSON.parse(response.response.text());

    const hasAny =
      (profile.basics && profile.basics.name) ||
      (profile.experience || []).length ||
      (profile.education || []).length;
    if (!hasAny) {
      return res
        .status(500)
        .json({ error: "Couldn't extract any profile data from that PDF." });
    }

    res.json({ profile });
  } catch (err) {
    console.error("LinkedIn import failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

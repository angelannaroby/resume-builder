export interface ResumeBullet {
  text: string;
  hidden: boolean;
}

export interface ResumeJob {
  title: string;
  org: string;
  dates: string;
  location: string;
  bullets: ResumeBullet[];
}

export interface ResumeSkill {
  label: string;
  items: string;
  hidden?: boolean;
}

export interface ResumeEducation {
  degree: string;
  org: string;
  dates: string;
  location: string;
  details: string;
  thesis?: string;
}

export interface ResumeExtra {
  label: string;
  text: string;
}

export interface Resume {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  relocation: string;
  linkedin: string;
  github: string;
  portfolio: string;
  summary: string;
  skills: ResumeSkill[];
  jobs: ResumeJob[];
  education: ResumeEducation[];
  extras: ResumeExtra[];
}


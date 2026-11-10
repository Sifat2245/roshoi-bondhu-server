import prisma from '../../lib/prisma.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../shared/errors/app-error.js';
const getUserProfile = async (targetUserIdOrSlug, currentUserId) => {
    const resolvedTargetId = targetUserIdOrSlug === 'me' && currentUserId ? currentUserId : targetUserIdOrSlug;
    if (!resolvedTargetId || resolvedTargetId === 'undefined' || resolvedTargetId === 'null') {
        throw new ValidationError('User ID or handle is required.');
    }
    if (targetUserIdOrSlug === 'me' && !currentUserId) {
        throw new UnauthorizedError('Authentication required to view your profile.');
    }
    const cleanHandle = resolvedTargetId.replace(/^@/, '').toLowerCase().trim();
    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { id: resolvedTargetId },
                { profile: { username: cleanHandle } },
                { email: cleanHandle },
                { email: { startsWith: `${cleanHandle}@` } },
            ],
        },
        include: {
            profile: true,
            preferences: true,
            _count: {
                select: {
                    posts: { where: { status: 'PUBLISHED' } },
                    followers: true,
                    following: true,
                    createdGroups: true,
                },
            },
        },
    });
    if (!user)
        throw new NotFoundError('User not found.');
    // Auto-provision initial profile if user does not have one yet
    let profile = user.profile;
    if (!profile) {
        try {
            const defaultUsername = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
            profile = await prisma.userProfile.create({
                data: {
                    userId: user.id,
                    username: defaultUsername,
                    bio: user.bio || '',
                    phone: user.phone || null,
                },
            });
        }
        catch {
            profile = null;
        }
    }
    let isFollowing = false;
    if (currentUserId && currentUserId !== user.id) {
        const follow = await prisma.follow.findUnique({
            where: {
                followerId_followingId: {
                    followerId: currentUserId,
                    followingId: user.id,
                },
            },
        });
        isFollowing = Boolean(follow);
    }
    const isMe = currentUserId ? currentUserId === user.id : false;
    const contactVis = profile?.contactVisibility || 'PUBLIC';
    const birthdayVis = profile?.birthdayVisibility || 'FRIENDS';
    // Field privacy policies per Phase 2 specifications
    const canSeeContact = isMe || contactVis === 'PUBLIC';
    const canSeeBirthday = isMe || birthdayVis === 'PUBLIC';
    return {
        id: user.id,
        name: user.name,
        email: isMe || canSeeContact ? user.email : '',
        username: profile?.username || user.email.split('@')[0],
        image: user.image,
        coverImage: user.coverImage,
        bio: profile?.bio || user.bio || '',
        city: profile?.city || '',
        work: profile?.work || '',
        education: profile?.education || '',
        phone: isMe || canSeeContact ? (profile?.phone || user.phone || '') : '',
        gender: profile?.gender || '',
        birthDate: isMe || canSeeBirthday ? (profile?.birthDate || null) : null,
        hometown: profile?.hometown || profile?.city || '',
        languages: profile?.languages || '',
        expertise: profile?.expertise || '',
        hobbies: profile?.hobbies || '',
        interests: profile?.interests || '',
        website: profile?.website || '',
        socialLinks: profile?.socialLinks || '',
        contactVisibility: contactVis,
        birthdayVisibility: birthdayVis,
        role: user.role,
        createdAt: user.createdAt,
        recipesCount: user._count.posts,
        postsCount: user._count.posts,
        followersCount: user._count.followers,
        followingCount: user._count.following,
        createdGroupsCount: user._count.createdGroups,
        _count: user._count,
        isFollowing,
        isMe,
        preferences: isMe ? user.preferences : null,
    };
};
const toggleFollow = async (currentUserId, targetUserId) => {
    if (!targetUserId || targetUserId === 'undefined' || targetUserId === 'null') {
        throw new ValidationError('Target user ID or handle is required.');
    }
    const cleanHandle = targetUserId.replace(/^@/, '').toLowerCase().trim();
    const targetUser = await prisma.user.findFirst({
        where: {
            OR: [
                { id: targetUserId },
                { profile: { username: cleanHandle } },
                { email: cleanHandle },
            ],
        },
        select: { id: true },
    });
    if (!targetUser)
        throw new NotFoundError('User to follow not found.');
    if (currentUserId === targetUser.id) {
        throw new ValidationError('You cannot follow yourself.');
    }
    const existingFollow = await prisma.follow.findUnique({
        where: {
            followerId_followingId: {
                followerId: currentUserId,
                followingId: targetUser.id,
            },
        },
    });
    let following = false;
    if (existingFollow) {
        await prisma.follow.delete({ where: { id: existingFollow.id } });
        following = false;
    }
    else {
        await prisma.follow.create({
            data: {
                followerId: currentUserId,
                followingId: targetUser.id,
            },
        });
        following = true;
    }
    const followersCount = await prisma.follow.count({
        where: { followingId: targetUser.id },
    });
    return { following, followersCount, isFollowing: following };
};
const updateProfile = async (userId, data) => {
    const { name, username, bio, city, work, education, phone, gender, birthDate, hometown, languages, expertise, hobbies, interests, website, socialLinks, contactVisibility, birthdayVisibility, image, coverImage, } = data;
    const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
    });
    if (!existingUser) {
        throw new NotFoundError('User not found.');
    }
    // Name validation
    if (name !== undefined) {
        if (!name.trim()) {
            throw new ValidationError('Name cannot be empty.');
        }
        if (name.trim().length > 70) {
            throw new ValidationError('Name cannot exceed 70 characters.');
        }
    }
    // Username validation
    let cleanUsername = undefined;
    if (username !== undefined) {
        if (username && username.trim()) {
            cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
            if (!/^[a-zA-Z0-9_]{3,30}$/.test(cleanUsername)) {
                throw new ValidationError('Username must be 3-30 characters and contain only letters, numbers, and underscores.');
            }
            const existingUsername = await prisma.userProfile.findFirst({
                where: {
                    username: cleanUsername,
                    NOT: { userId },
                },
            });
            if (existingUsername) {
                throw new ValidationError(`Username @${cleanUsername} is already taken. Please choose another.`);
            }
        }
        else {
            cleanUsername = null;
        }
    }
    // Phone validation
    if (phone !== undefined) {
        const trimmedPhone = phone.trim();
        if (trimmedPhone && !/^[+0-9\s\-()]{6,20}$/.test(trimmedPhone)) {
            throw new ValidationError('Please enter a valid phone number (6-20 digits).');
        }
    }
    // BirthDate validation
    let parsedBirthDate = undefined;
    if (birthDate !== undefined) {
        if (birthDate === null || birthDate === '') {
            parsedBirthDate = null;
        }
        else {
            const d = new Date(birthDate);
            if (isNaN(d.getTime())) {
                throw new ValidationError('Please enter a valid birth date.');
            }
            parsedBirthDate = d;
        }
    }
    // Privacy enums validation
    if (contactVisibility !== undefined && !['PUBLIC', 'FRIENDS', 'PRIVATE'].includes(contactVisibility)) {
        throw new ValidationError('Contact visibility must be PUBLIC, FRIENDS, or PRIVATE.');
    }
    if (birthdayVisibility !== undefined && !['PUBLIC', 'FRIENDS', 'PRIVATE'].includes(birthdayVisibility)) {
        throw new ValidationError('Birthday visibility must be PUBLIC, FRIENDS, or PRIVATE.');
    }
    // 1. Update Core User model directly
    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
            name: name !== undefined ? name.trim() : undefined,
            image: image !== undefined ? image : undefined,
            coverImage: coverImage !== undefined ? coverImage : undefined,
            bio: bio !== undefined ? bio : undefined,
            phone: phone !== undefined ? phone.trim() : undefined,
        },
    });
    // 2. Upsert UserProfile model with personal details
    await prisma.userProfile.upsert({
        where: { userId },
        create: {
            userId,
            username: cleanUsername || existingUser.profile?.username || updatedUser.email.split('@')[0],
            bio: bio !== undefined ? bio : (updatedUser.bio || ''),
            city: city !== undefined ? city.trim() : null,
            work: work !== undefined ? work.trim() : null,
            education: education !== undefined ? education.trim() : null,
            phone: phone !== undefined ? phone.trim() : (updatedUser.phone || null),
            gender: gender !== undefined ? gender.trim() : null,
            birthDate: parsedBirthDate !== undefined ? parsedBirthDate : null,
            hometown: hometown !== undefined ? hometown.trim() : (city !== undefined ? city.trim() : null),
            languages: languages !== undefined ? languages.trim() : null,
            expertise: expertise !== undefined ? expertise.trim() : null,
            hobbies: hobbies !== undefined ? hobbies.trim() : null,
            interests: interests !== undefined ? interests.trim() : null,
            website: website !== undefined ? website.trim() : null,
            socialLinks: socialLinks !== undefined ? socialLinks.trim() : null,
            contactVisibility: contactVisibility || 'PUBLIC',
            birthdayVisibility: birthdayVisibility || 'FRIENDS',
        },
        update: {
            username: cleanUsername !== undefined ? cleanUsername : undefined,
            bio: bio !== undefined ? bio : undefined,
            city: city !== undefined ? city.trim() : undefined,
            work: work !== undefined ? work.trim() : undefined,
            education: education !== undefined ? education.trim() : undefined,
            phone: phone !== undefined ? phone.trim() : undefined,
            gender: gender !== undefined ? gender.trim() : undefined,
            birthDate: parsedBirthDate !== undefined ? parsedBirthDate : undefined,
            hometown: hometown !== undefined ? hometown.trim() : undefined,
            languages: languages !== undefined ? languages.trim() : undefined,
            expertise: expertise !== undefined ? expertise.trim() : undefined,
            hobbies: hobbies !== undefined ? hobbies.trim() : undefined,
            interests: interests !== undefined ? interests.trim() : undefined,
            website: website !== undefined ? website.trim() : undefined,
            socialLinks: socialLinks !== undefined ? socialLinks.trim() : undefined,
            contactVisibility: contactVisibility !== undefined ? contactVisibility : undefined,
            birthdayVisibility: birthdayVisibility !== undefined ? birthdayVisibility : undefined,
        },
    });
    return await getUserProfile(userId, userId);
};
const getPreferences = async (userId) => {
    let preferences = await prisma.userPreference.findUnique({
        where: { userId },
    });
    if (!preferences) {
        preferences = await prisma.userPreference.create({
            data: {
                userId,
                theme: 'SYSTEM',
                locale: 'bn',
                timezone: 'Asia/Dhaka',
                defaultPostAudience: 'PUBLIC',
                friendRequestPolicy: 'EVERYONE',
                messagePolicy: 'EVERYONE',
                twoFactorEnabled: false,
            },
        });
    }
    return preferences;
};
const updatePreferences = async (userId, data) => {
    const { theme, locale, timezone, defaultPostAudience, friendRequestPolicy, messagePolicy, twoFactorEnabled, } = data;
    if (theme !== undefined && !['SYSTEM', 'LIGHT', 'DARK'].includes(theme)) {
        throw new ValidationError('Theme must be SYSTEM, LIGHT, or DARK.');
    }
    if (locale !== undefined && !['bn', 'en'].includes(locale)) {
        throw new ValidationError('Locale must be bn or en.');
    }
    if (defaultPostAudience !== undefined && !['PUBLIC', 'FRIENDS', 'ONLY_ME'].includes(defaultPostAudience)) {
        throw new ValidationError('Default post audience must be PUBLIC, FRIENDS, or ONLY_ME.');
    }
    if (friendRequestPolicy !== undefined && !['EVERYONE', 'FRIENDS_OF_FRIENDS'].includes(friendRequestPolicy)) {
        throw new ValidationError('Friend request policy must be EVERYONE or FRIENDS_OF_FRIENDS.');
    }
    if (messagePolicy !== undefined && !['EVERYONE', 'FRIENDS'].includes(messagePolicy)) {
        throw new ValidationError('Message policy must be EVERYONE or FRIENDS.');
    }
    return await prisma.userPreference.upsert({
        where: { userId },
        create: {
            userId,
            theme: theme || 'SYSTEM',
            locale: locale || 'bn',
            timezone: timezone || 'Asia/Dhaka',
            defaultPostAudience: defaultPostAudience || 'PUBLIC',
            friendRequestPolicy: friendRequestPolicy || 'EVERYONE',
            messagePolicy: messagePolicy || 'EVERYONE',
            twoFactorEnabled: twoFactorEnabled !== undefined ? twoFactorEnabled : false,
        },
        update: {
            theme: theme !== undefined ? theme : undefined,
            locale: locale !== undefined ? locale : undefined,
            timezone: timezone !== undefined ? timezone : undefined,
            defaultPostAudience: defaultPostAudience !== undefined ? defaultPostAudience : undefined,
            friendRequestPolicy: friendRequestPolicy !== undefined ? friendRequestPolicy : undefined,
            messagePolicy: messagePolicy !== undefined ? messagePolicy : undefined,
            twoFactorEnabled: twoFactorEnabled !== undefined ? twoFactorEnabled : undefined,
        },
    });
};
export const UserService = {
    getUserProfile,
    toggleFollow,
    updateProfile,
    getPreferences,
    updatePreferences,
};
export default UserService;

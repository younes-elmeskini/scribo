const clientId = req.client?.id;
      if (!clientId) {
        res.status(400).json({ message: "Unauthorized" });
        return;
      }

      const campagnes = await prisma.compagne.findMany({
        where: {
          OR: [
            {
              clientId: clientId.toString(), // Owner
            },
            {
              TeamCompagne: {
                some: {
                  teamMember: {
                    membreId: clientId.toString(), // Membre
                  },
                },
              },
            },
          ],
        },
        select: {
          id: true,
          compagneName: true,
          status: true,
          favrite: true,
          soumission: true,
          Call: true,
          Email: true,
          Notes: true,
          Task: true,
          appointment: true,
        },
      });
